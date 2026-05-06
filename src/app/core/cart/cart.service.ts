import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { SupabaseService } from '../supabase/supabase.service';
import { LocalStorageService } from '../storage/local-storage.service';
import type {
  AnonCartItem,
  CartItemRow,
  CartLine,
  ProductRow,
  SetRow,
} from '../catalog/catalog.types';

const STORAGE_KEY = 'cart:v1';

/**
 * Customer cart, dual-backend.
 *
 * - Signed out → items live in `localStorage` under `cart:v1`.
 * - Signed in  → items live in the `cart_items` Supabase table.
 *
 * Switching is automatic via an effect on `auth.currentUser()`. On sign-in
 * we merge any anonymous items into the DB cart (summing quantities, capped
 * at `products.quantity`) and clear localStorage; on sign-out the DB cart
 * stays where it is and the local view resets to whatever's in localStorage
 * (typically empty after a freshly-signed-out session).
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly storage = inject(LocalStorageService);

  private readonly _items = signal<CartLine[]>([]);
  private readonly _loading = signal(false);
  private readonly _drawerOpen = signal(false);

  readonly items = this._items.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly drawerOpen = this._drawerOpen.asReadonly();
  readonly itemCount = computed(() =>
    this._items().reduce((n, l) => n + l.quantity, 0),
  );
  readonly subtotal = computed(() =>
    this._items().reduce((s, l) => s + l.price * l.quantity, 0),
  );

  /** Last-seen user id; lets the auth effect detect transitions
   *  (anon→authed, authed→anon, switched user, simple refresh). */
  private lastUserId: string | null | undefined = undefined;

  constructor() {
    effect(async () => {
      const user = this.auth.currentUser();
      // `undefined` while session is being hydrated; wait for definitive value.
      if (user === undefined) return;
      const userId = user?.id ?? null;
      const previous = this.lastUserId;
      if (userId === previous) return;
      this.lastUserId = userId;
      await this.handleAuthChange(previous, userId);
    });
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  /** Increase a product's quantity by `delta` (default 1) or insert a new
   *  line. Returns `{ error }` if it would exceed available stock. */
  async add(productId: string, delta: number = 1): Promise<{ error?: string }> {
    if (delta <= 0) return {};
    const existing = this._items().find((l) => l.product_id === productId);
    if (existing) {
      return this.setQuantity(productId, existing.quantity + delta);
    }
    // New line — fetch the product to know its stock + render fields.
    const product = await this.fetchProduct(productId);
    if (!product) return { error: 'Producto no disponible.' };
    if (delta > product.stock) {
      return { error: `Solo hay ${product.stock} en stock.` };
    }
    const userId = this.lastUserId;
    if (userId) {
      const { error } = await (this.supabase.client as any)
        .from('cart_items')
        .insert({ user_id: userId, product_id: productId, quantity: delta });
      if (error) return { error: this.errorMessage(error) };
    } else {
      const next = [
        ...this.readAnon(),
        {
          product_id: productId,
          quantity: delta,
          added_at: new Date().toISOString(),
        },
      ];
      this.writeAnon(next);
    }
    this._items.update((lines) => [
      {
        product_id: product.product_id,
        quantity: delta,
        added_at: new Date().toISOString(),
        name: product.name,
        slug: product.slug,
        image_url: product.image_url,
        price: product.price,
        stock: product.stock,
        condition: product.condition,
        card_number: product.card_number,
        type1: product.type1,
        type2: product.type2,
        set_name: product.set_name,
      },
      ...lines,
    ]);
    this.openDrawer();
    return {};
  }

  /** Set a line's quantity to an exact value. Removes the line if `qty` is 0. */
  async setQuantity(productId: string, qty: number): Promise<{ error?: string }> {
    if (qty <= 0) {
      await this.remove(productId);
      return {};
    }
    const line = this._items().find((l) => l.product_id === productId);
    if (!line) return { error: 'Esa carta no está en tu carrito.' };
    if (qty > line.stock) return { error: `Solo hay ${line.stock} en stock.` };

    const userId = this.lastUserId;
    if (userId) {
      const { error } = await (this.supabase.client as any)
        .from('cart_items')
        .update({ quantity: qty })
        .eq('user_id', userId)
        .eq('product_id', productId);
      if (error) return { error: this.errorMessage(error) };
    } else {
      this.writeAnon(
        this.readAnon().map((it) =>
          it.product_id === productId ? { ...it, quantity: qty } : it,
        ),
      );
    }
    this._items.update((lines) =>
      lines.map((l) => (l.product_id === productId ? { ...l, quantity: qty } : l)),
    );
    return {};
  }

  async remove(productId: string): Promise<void> {
    const userId = this.lastUserId;
    if (userId) {
      await (this.supabase.client as any)
        .from('cart_items')
        .delete()
        .eq('user_id', userId)
        .eq('product_id', productId);
    } else {
      this.writeAnon(this.readAnon().filter((it) => it.product_id !== productId));
    }
    this._items.update((lines) => lines.filter((l) => l.product_id !== productId));
  }

  async clear(): Promise<void> {
    const userId = this.lastUserId;
    if (userId) {
      await (this.supabase.client as any)
        .from('cart_items')
        .delete()
        .eq('user_id', userId);
    } else {
      this.storage.set(STORAGE_KEY, null);
    }
    this._items.set([]);
  }

  openDrawer(): void {
    this._drawerOpen.set(true);
  }

  closeDrawer(): void {
    this._drawerOpen.set(false);
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private async handleAuthChange(
    previous: string | null | undefined,
    current: string | null,
  ): Promise<void> {
    this._loading.set(true);
    try {
      if (current && previous === null) {
        // Just signed in — merge anon cart into DB, then hydrate from DB.
        const anon = this.readAnon();
        if (anon.length > 0) {
          await this.mergeAnonIntoDb(anon, current);
        }
        this.storage.set(STORAGE_KEY, null);
        await this.hydrateFromDb(current);
      } else if (current) {
        // Already signed in (page refresh) or switched accounts.
        await this.hydrateFromDb(current);
      } else {
        // Signed out (or never signed in) — read from localStorage.
        await this.hydrateFromAnon();
      }
    } finally {
      this._loading.set(false);
    }
  }

  private async hydrateFromDb(userId: string): Promise<void> {
    // Inner-join products so unavailable items (deleted, inactive, qty=0,
    // price=0) drop out automatically — RLS on `products` filters those out
    // for the public read predicate.
    const { data, error } = await (this.supabase.client as any)
      .from('cart_items')
      .select(
        'product_id, quantity, added_at, products!inner(id, name, slug, image_url, price, quantity, condition, card_number, type1, type2, sets(name))',
      )
      .eq('user_id', userId)
      .order('added_at', { ascending: false });
    if (error) {
      console.error('[cart] hydrateFromDb', error);
      this._items.set([]);
      return;
    }
    type DbRow = {
      product_id: string;
      quantity: number;
      added_at: string;
      products: Pick<
        ProductRow,
        | 'id'
        | 'name'
        | 'slug'
        | 'image_url'
        | 'price'
        | 'quantity'
        | 'condition'
        | 'card_number'
        | 'type1'
        | 'type2'
      > & { sets: Pick<SetRow, 'name'> | null };
    };
    const lines: CartLine[] = ((data ?? []) as DbRow[]).map((row) => ({
      product_id: row.product_id,
      quantity: Math.min(row.quantity, row.products.quantity),
      added_at: row.added_at,
      name: row.products.name,
      slug: row.products.slug,
      image_url: row.products.image_url,
      price: row.products.price,
      stock: row.products.quantity,
      condition: row.products.condition,
      card_number: row.products.card_number,
      type1: row.products.type1,
      type2: row.products.type2,
      set_name: row.products.sets?.name ?? null,
    }));
    this._items.set(lines);
  }

  private async hydrateFromAnon(): Promise<void> {
    const items = this.readAnon();
    if (items.length === 0) {
      this._items.set([]);
      return;
    }
    const ids = items.map((i) => i.product_id);
    const { data, error } = await (this.supabase.client as any)
      .from('products')
      .select(
        'id, name, slug, image_url, price, quantity, condition, card_number, type1, type2, sets(name)',
      )
      .in('id', ids);
    if (error) {
      console.error('[cart] hydrateFromAnon', error);
      this._items.set([]);
      return;
    }
    type Row = Pick<
      ProductRow,
      | 'id'
      | 'name'
      | 'slug'
      | 'image_url'
      | 'price'
      | 'quantity'
      | 'condition'
      | 'card_number'
      | 'type1'
      | 'type2'
    > & { sets: Pick<SetRow, 'name'> | null };
    const byId = new Map<string, Row>(((data ?? []) as Row[]).map((r) => [r.id, r]));
    const lines: CartLine[] = items
      .map((it) => {
        const p = byId.get(it.product_id);
        if (!p) return null; // product is gone or filtered by RLS — drop
        return {
          product_id: it.product_id,
          quantity: Math.min(it.quantity, p.quantity),
          added_at: it.added_at,
          name: p.name,
          slug: p.slug,
          image_url: p.image_url,
          price: p.price,
          stock: p.quantity,
          condition: p.condition,
          card_number: p.card_number,
          type1: p.type1,
          type2: p.type2,
          set_name: p.sets?.name ?? null,
        } as CartLine;
      })
      .filter((l): l is CartLine => l !== null)
      .sort((a, b) => b.added_at.localeCompare(a.added_at));
    this._items.set(lines);
    // Persist any cleanup from the hydrate (dropped items, capped quantities)
    // back to localStorage so subsequent reads are clean.
    this.writeAnon(
      lines.map((l) => ({
        product_id: l.product_id,
        quantity: l.quantity,
        added_at: l.added_at,
      })),
    );
  }

  /** Sum anonymous quantities into the user's DB cart, capping at stock.
   *  Best-effort per-item: a single failure logs and continues. */
  private async mergeAnonIntoDb(items: AnonCartItem[], userId: string): Promise<void> {
    if (items.length === 0) return;
    const { data: existing, error: readErr } = await (this.supabase.client as any)
      .from('cart_items')
      .select('product_id, quantity')
      .eq('user_id', userId);
    if (readErr) {
      console.error('[cart] mergeAnonIntoDb read', readErr);
      return;
    }
    const dbByProduct = new Map<string, number>(
      ((existing ?? []) as CartItemRow[]).map((r) => [r.product_id, r.quantity]),
    );

    // Look up stock for the anon products.
    const ids = items.map((i) => i.product_id);
    const { data: products, error: prodErr } = await (this.supabase.client as any)
      .from('products')
      .select('id, quantity')
      .in('id', ids);
    if (prodErr) {
      console.error('[cart] mergeAnonIntoDb products', prodErr);
      return;
    }
    const stockById = new Map<string, number>(
      ((products ?? []) as Pick<ProductRow, 'id' | 'quantity'>[]).map((p) => [
        p.id,
        p.quantity,
      ]),
    );

    const upserts = items
      .map((it) => {
        const stock = stockById.get(it.product_id);
        if (stock == null || stock <= 0) return null;
        const current = dbByProduct.get(it.product_id) ?? 0;
        const wanted = current + it.quantity;
        return {
          user_id: userId,
          product_id: it.product_id,
          quantity: Math.min(wanted, stock),
        };
      })
      .filter((u): u is { user_id: string; product_id: string; quantity: number } => u !== null);

    if (upserts.length === 0) return;
    const { error: upErr } = await (this.supabase.client as any)
      .from('cart_items')
      .upsert(upserts, { onConflict: 'user_id,product_id' });
    if (upErr) console.error('[cart] mergeAnonIntoDb upsert', upErr);
  }

  /** Single-product fetch used by `add()` when the line doesn't yet exist
   *  in the local cache. Returns the same shape as a CartLine minus
   *  quantity/added_at (those are decided by the caller). */
  private async fetchProduct(productId: string): Promise<{
    product_id: string;
    name: string;
    slug: string;
    image_url: string | null;
    price: number;
    stock: number;
    condition: string | null;
    card_number: string | null;
    type1: string | null;
    type2: string | null;
    set_name: string | null;
  } | null> {
    const { data, error } = await (this.supabase.client as any)
      .from('products')
      .select(
        'id, name, slug, image_url, price, quantity, condition, card_number, type1, type2, sets(name)',
      )
      .eq('id', productId)
      .maybeSingle();
    if (error) {
      console.error('[cart] fetchProduct', error);
      return null;
    }
    if (!data) return null;
    type Row = Pick<
      ProductRow,
      'id' | 'name' | 'slug' | 'image_url' | 'price' | 'quantity' | 'condition' | 'card_number' | 'type1' | 'type2'
    > & { sets: Pick<SetRow, 'name'> | null };
    const p = data as Row;
    return {
      product_id: p.id,
      name: p.name,
      slug: p.slug,
      image_url: p.image_url,
      price: p.price,
      stock: p.quantity,
      condition: p.condition,
      card_number: p.card_number,
      type1: p.type1,
      type2: p.type2,
      set_name: p.sets?.name ?? null,
    };
  }

  private readAnon(): AnonCartItem[] {
    const raw = this.storage.get(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed as AnonCartItem[];
    } catch {
      return [];
    }
  }

  private writeAnon(items: AnonCartItem[]): void {
    if (items.length === 0) {
      this.storage.set(STORAGE_KEY, null);
    } else {
      this.storage.set(STORAGE_KEY, JSON.stringify(items));
    }
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
