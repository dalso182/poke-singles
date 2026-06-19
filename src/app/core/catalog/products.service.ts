import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import { CategoriesService } from './categories.service';
import type {
  ProductInsert,
  ProductListRow,
  ProductRow,
  ProductSearchRow,
  ProductUpdate,
  RaffleCardItem,
  SortKey,
} from './catalog.types';

export interface ProductListParams {
  search?: string;
  categoryId?: string;
  setId?: string;
  /** Multi-set filter — products whose set_id is in this list. Wins over
   *  `setId` when both are provided. Empty array is ignored. */
  setIds?: string[];
  featured?: boolean;
  includeInactive?: boolean;
  /** Exclude raffle products (category slug = 'rifas') from the result. Used by
   *  the home rails so raffles only ever surface on /rifas. No-op if the Rifas
   *  category doesn't exist. */
  excludeRaffles?: boolean;
  /** Apply the public storefront-visibility predicate (quantity > 0 AND price > 0)
   *  in the query itself. Storefront surfaces (home rails) must set this:
   *  visibility can't lean on RLS alone because an admin session bypasses
   *  `products_public_read` via the permissive `products_admin_all` policy and
   *  would otherwise see sold-out rows. Off by default so admin callers are
   *  unaffected. Pairs with the default `active = true` filter (when
   *  `includeInactive` is falsy). */
  inStockOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ProductListResult {
  rows: ProductListRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProductSearchParams {
  q: string;
  sort: SortKey;
  /** Multi-set filter — same shape as ProductListParams.setIds, narrows
   *  search to products whose set_id is in this list. Empty / undefined =
   *  no filter. */
  setIds?: string[];
  /** Multi-card-type filter — array-overlap against products_search.card_type_ids.
   *  Empty / undefined = no filter. */
  cardTypeIds?: string[];
  /** When true, restrict results to discounted products (sale_price is not
   *  null). Drives the /ofertas listing. Default false. */
  onSaleOnly?: boolean;
  /** Restrict results to a single category by slug (resolved server-side via
   *  category_id_by_slug). Drives the /categoria/:slug listing. Undefined =
   *  no category filter (the full catalog). */
  categorySlug?: string;
  page?: number;
  pageSize?: number;
}

export interface ProductSearchResult {
  rows: ProductSearchRow[];
  page: number;
  pageSize: number;
}

@Injectable({ providedIn: 'root' })
export class ProductsService {
  private readonly supabase = inject(SupabaseService);
  private readonly categories = inject(CategoriesService);

  /** Memoised id of the 'rifas' category (or null if it doesn't exist).
   *  Resolved from the cached-on-first-call categories list. `undefined` =
   *  not yet resolved, `null` = resolved-but-absent. */
  private _raffleCategoryId: string | null | undefined;

  /** Lazily resolve + cache the Rifas category id. Used to include raffles on
   *  /rifas and exclude them from the home rails. */
  async raffleCategoryId(): Promise<string | null> {
    if (this._raffleCategoryId !== undefined) return this._raffleCategoryId;
    const cats = await this.categories.list();
    this._raffleCategoryId = cats.find((c) => c.slug === 'rifas')?.id ?? null;
    return this._raffleCategoryId;
  }

  async list(params: ProductListParams = {}): Promise<ProductListResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(200, params.pageSize ?? 25));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const raffleId = params.excludeRaffles ? await this.raffleCategoryId() : null;

    let query = (this.supabase.client as any)
      .from('products')
      .select('*, sets(name, printed_total)', { count: 'exact' })
      .order('last_restocked_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (!params.includeInactive) {
      query = query.eq('active', true);
    }
    if (params.inStockOnly) {
      query = query.gt('quantity', 0).gt('price', 0);
    }
    if (raffleId) {
      query = query.neq('category_id', raffleId);
    }
    if (params.categoryId) {
      query = query.eq('category_id', params.categoryId);
    }
    if (params.setIds && params.setIds.length > 0) {
      query = query.in('set_id', params.setIds);
    } else if (params.setId) {
      query = query.eq('set_id', params.setId);
    }
    if (params.featured !== undefined) {
      query = query.eq('featured', params.featured);
    }
    if (params.search) {
      const term = params.search.trim();
      if (term.length > 0) {
        const escaped = term.replace(/[%_]/g, '\\$&');
        query = query.or(
          `name.ilike.%${escaped}%,pokemon_name.ilike.%${escaped}%,slug.ilike.%${escaped}%`,
        );
      }
    }

    const { data, error, count } = await query;
    if (error) throw error;
    // Flatten the postgrest embed (`sets: { name, printed_total } | null`)
    // into top-level `set_name` / `set_printed_total` so callers stay flat.
    const rows: ProductListRow[] = ((data ?? []) as (ProductRow & {
      sets: { name: string | null; printed_total: number | null } | null;
    })[]).map(({ sets, ...rest }) => ({
      ...rest,
      set_name: sets?.name ?? null,
      set_printed_total: sets?.printed_total ?? null,
    }));
    return { rows, total: count ?? 0, page, pageSize };
  }

  /**
   * Public raffle listing for /rifas — reads the `rifas_listing` view (products
   * ⨝ raffles ⨝ sets), already filtered to active Rifas-category products and
   * ordered by draw date. Carries draw_at / status / winner_name so the page can
   * split into Activas vs Completadas tabs.
   */
  async listRaffles(): Promise<RaffleCardItem[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('rifas_listing')
      .select('*');
    if (error) throw error;
    return (data ?? []) as RaffleCardItem[];
  }

  async get(id: string): Promise<ProductRow | null> {
    const { data, error } = await (this.supabase.client as any)
      .from('products')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as ProductRow | null) ?? null;
  }

  async getBySlug(slug: string): Promise<ProductRow | null> {
    const { data, error } = await (this.supabase.client as any)
      .from('products')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw error;
    return (data as ProductRow | null) ?? null;
  }

  /**
   * All products for a TCGdex card id, any condition/variant/language. Powers
   * the add-product duplicate warning: a card can be several SKUs (each its own
   * unique slug), so this returns 0..n rows. Admin RLS (`products_admin_all`)
   * lets this see inactive / out-of-stock rows so dormant duplicates surface.
   */
  async listByCardRef(cardRef: string): Promise<ProductRow[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('products')
      .select('id, slug, name, condition, variant, language, quantity, active, card_number, set_id')
      .eq('card_ref', cardRef)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as ProductRow[] | null) ?? [];
  }

  async create(input: ProductInsert): Promise<ProductRow> {
    const { data, error } = await (this.supabase.client as any)
      .from('products')
      .insert(input)
      .select('*')
      .single();
    if (error) throw error;
    return data as ProductRow;
  }

  async update(id: string, patch: ProductUpdate): Promise<ProductRow> {
    const { data, error } = await (this.supabase.client as any)
      .from('products')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as ProductRow;
  }

  async setActive(id: string, active: boolean): Promise<ProductRow> {
    return this.update(id, { active });
  }

  async setFeatured(id: string, featured: boolean): Promise<ProductRow> {
    return this.update(id, { featured });
  }

  /**
   * Customer-facing search. Calls the `search_products` RPC which encapsulates
   * the four sort modes (relevance, price-asc, price-desc, recent) and the
   * substring ILIKE against the `products_search` view's `search_text` column.
   * RLS still applies (function is `security invoker`), so anon clients only
   * see active in-stock priced rows.
   */
  async search(params: ProductSearchParams): Promise<ProductSearchResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(200, params.pageSize ?? 60));
    const { data, error } = await (this.supabase.client as any).rpc('search_products', {
      q: params.q,
      sort: params.sort,
      limit_n: pageSize,
      offset_n: (page - 1) * pageSize,
      set_ids: params.setIds && params.setIds.length > 0 ? params.setIds : null,
      // Param prefixed `p_` in SQL to avoid clashing with the
      // products_search.card_type_ids column of the same name inside the
      // function body.
      p_card_type_ids:
        params.cardTypeIds && params.cardTypeIds.length > 0 ? params.cardTypeIds : null,
      p_on_sale_only: params.onSaleOnly ?? false,
      p_category_slug: params.categorySlug ?? null,
    });
    if (error) throw error;
    return { rows: (data ?? []) as ProductSearchRow[], page, pageSize };
  }

  async slugInUse(slug: string, exceptId?: string): Promise<boolean> {
    let query = (this.supabase.client as any)
      .from('products')
      .select('id', { head: true, count: 'exact' })
      .eq('slug', slug);
    if (exceptId) query = query.neq('id', exceptId);
    const { error, count } = await query;
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  async getCardTypeIds(productId: string): Promise<string[]> {
    const { data, error } = await (this.supabase.client as any)
      .from('product_card_types')
      .select('card_type_id')
      .eq('product_id', productId);
    if (error) throw error;
    return ((data ?? []) as { card_type_id: string }[]).map((r) => r.card_type_id);
  }

  /**
   * Replace the full set of card_type assignments for a product.
   * Implemented as delete-then-insert. Admin-only writes happen one product at
   * a time, so the brief gap between delete and insert is not a concern.
   */
  async setCardTypes(productId: string, cardTypeIds: string[]): Promise<void> {
    const { error: delErr } = await (this.supabase.client as any)
      .from('product_card_types')
      .delete()
      .eq('product_id', productId);
    if (delErr) throw delErr;
    if (cardTypeIds.length === 0) return;
    const rows = cardTypeIds.map((card_type_id) => ({
      product_id: productId,
      card_type_id,
    }));
    const { error: insErr } = await (this.supabase.client as any)
      .from('product_card_types')
      .insert(rows);
    if (insErr) throw insErr;
  }
}
