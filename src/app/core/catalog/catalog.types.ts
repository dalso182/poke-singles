// Local mirrors of the catalog table shapes.
// After `npm run db:push:dev` + `npm run db:types`, these can be replaced with
// `Tables<'products'>` etc. from `../supabase/database.types`. Kept here so the
// app compiles before the regen lands.

export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  sort_order: number;
  created_at: string;
}

export interface CategoryInsert {
  slug: string;
  name: string;
  active?: boolean;
  sort_order?: number;
}

export type CategoryUpdate = Partial<CategoryInsert>;

export interface CardTypeRow {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  sort_order: number;
  created_at: string;
}

export interface CardTypeInsert {
  slug: string;
  name: string;
  active?: boolean;
  sort_order?: number;
}

export type CardTypeUpdate = Partial<CardTypeInsert>;

export interface SetRow {
  id: string;
  code: string;
  name: string;
  series: string | null;
  release_date: string | null;
  symbol_image_url: string | null;
  printed_total: number | null;
  created_at: string;
}

export interface SetInsert {
  code: string;
  name: string;
  series?: string | null;
  release_date?: string | null;
  symbol_image_url?: string | null;
  printed_total?: number | null;
}

export type SetUpdate = Partial<Omit<SetInsert, 'code'>>;

export interface ProductRow {
  id: string;
  category_id: string;
  set_id: string | null;
  name: string;
  pokemon_name: string | null;
  slug: string;
  description: string | null;
  rarity: string | null;
  card_number: string | null;
  language: string;
  condition: string | null;
  variant: string | null;
  price: number;
  sale_price: number | null;
  quantity: number;
  image_url: string | null;
  active: boolean;
  first_listed_at: string;
  last_restocked_at: string | null;
  created_at: string;
  updated_at: string;
  tcgdex_id: string | null;
  illustrator: string | null;
  regulation_mark: string | null;
  category: string | null;
  stage: string | null;
  type1: string | null;
  type2: string | null;
  legal_standard: boolean | null;
  legal_expanded: boolean | null;
  featured: boolean;
}

export interface ProductInsert {
  category_id: string;
  set_id?: string | null;
  name: string;
  pokemon_name?: string | null;
  slug: string;
  description?: string | null;
  rarity?: string | null;
  card_number?: string | null;
  language?: string;
  condition?: string | null;
  variant?: string | null;
  price: number;
  sale_price?: number | null;
  quantity?: number;
  image_url?: string | null;
  active?: boolean;
  tcgdex_id?: string | null;
  illustrator?: string | null;
  regulation_mark?: string | null;
  category?: string | null;
  stage?: string | null;
  type1?: string | null;
  type2?: string | null;
  legal_standard?: boolean | null;
  legal_expanded?: boolean | null;
  featured?: boolean;
}

/** ProductRow plus the joined set's name + printed_total. Returned by
 *  ProductsService.list() so callers that render card meta lines (home
 *  rails, admin tables) don't need a separate fetch for the set. */
export interface ProductListRow extends ProductRow {
  set_name: string | null;
  set_printed_total: number | null;
}

/** Minimal shape the shared <app-product-card> needs. Structurally satisfied
 *  by ProductSearchRow (listings) and ProductListRow (home rails) — no
 *  mapping required at call sites. */
export interface ProductCardItem {
  id: string;
  slug: string;
  name: string;
  image_url: string | null;
  illustrator: string | null;
  price: number;
  sale_price: number | null;
  quantity: number;
  card_number: string | null;
  set_name: string | null;
  set_printed_total: number | null;
  condition: string | null;
  type1: string | null;
  type2: string | null;
}

export type RaffleStatus = 'scheduled' | 'drawn' | 'void';

/** Shape the <app-raffle-card> tile needs — matches the `rifas_listing` view
 *  (products ⨝ raffles) returned by ProductsService.listRaffles(). `notes`
 *  comes from products.description; draw/winner come from the raffles table. */
export interface RaffleCardItem {
  id: string;
  name: string;
  image_url: string | null;
  price: number;
  sale_price: number | null;
  quantity: number;
  notes: string | null;
  draw_at: string | null;
  status: RaffleStatus;
  winner_name: string | null;
  total_entries: number;
  /** Non-cancelled entries already bought. Total spaces = quantity + entries_sold. */
  entries_sold: number;
  card_number: string | null;
  set_name: string | null;
  set_printed_total: number | null;
  /** The card's real market value (CRC), shown to justify the raffle. */
  market_price: number | null;
}

/** Admin raffle list row from the admin_raffles_summary() RPC: product fields +
 *  draw status + entry counts. */
export interface RaffleSummaryRow {
  product_id: string;
  name: string;
  image_url: string | null;
  slug: string;
  price: number;
  quantity: number;
  active: boolean;
  draw_at: string | null;
  status: RaffleStatus;
  winner_name: string | null;
  drawn_at: string | null;
  entries_sold: number;
  entries_pending: number;
  participants: number;
}

/** A row of the `raffles` table (admin-read). 1:1 with a Rifas-category product. */
export interface RaffleRow {
  product_id: string;
  draw_at: string | null;
  market_price: number | null;
  status: RaffleStatus;
  winner_order_id: string | null;
  winner_name: string | null;
  winner_email: string | null;
  winning_entry: number | null;
  total_entries: number;
  drawn_by: string | null;
  drawn_at: string | null;
  notified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TcgdexCardRow {
  tcgdex_id: string;
  data: unknown;
  fetched_at: string;
}

export interface ProfileRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  default_shipping_address: ShippingAddress | null;
  created_at: string;
  updated_at: string;
}

export type ProfileUpdate = Partial<
  Pick<ProfileRow, 'full_name' | 'phone' | 'default_shipping_address'>
>;

export interface CartItemRow {
  user_id: string;
  product_id: string;
  quantity: number;
  added_at: string;
}

/** Cart item joined with the product fields the cart UI needs to render
 *  without a second fetch. Used by both the drawer and `/cart`. */
export interface CartLine {
  product_id: string;
  quantity: number;
  added_at: string;
  name: string;
  slug: string;
  image_url: string | null;
  price: number;
  /** Current `products.quantity` at the time of hydrate. Drives stock caps. */
  stock: number;
  condition: string | null;
  card_number: string | null;
  type1: string | null;
  type2: string | null;
  set_name: string | null;
  /** Drives category-scoped coupon discounts (see AppliedCoupon.category_ids). */
  category_id: string;
}

/** localStorage shape — same as the DB row minus `user_id`. */
export interface AnonCartItem {
  product_id: string;
  quantity: number;
  added_at: string;
}

// ---- Coupons ----

export type CouponType = 'PERCENTAGE' | 'FIXED_ON_THRESHOLD';

export type CouponErrorCode =
  | 'AUTH_REQUIRED'
  | 'NOT_FOUND'
  | 'INACTIVE'
  | 'EXPIRED'
  | 'LIMIT_REACHED'
  | 'BELOW_MINIMUM'
  /** Targeted coupon, but the cart has no item in its categories. */
  | 'NO_ELIGIBLE_ITEMS';

/** Result returned by the validate_coupon RPC. */
export type ValidateCouponResult =
  | {
      ok: true;
      coupon_id: string;
      type: CouponType;
      discount_value: number;
      min_purchase_amount: number | null;
      /** Allow-list of category ids the coupon applies to; null = all. */
      category_ids: string[] | null;
      expires_at: string;
    }
  | { ok: false; error: CouponErrorCode; gap?: number };

/** Subset of coupon data the cart keeps in memory after a successful
 *  validate / hydrate. The full row lives on the server. */
export interface AppliedCoupon {
  coupon_id: string;
  code: string;
  type: CouponType;
  discount_value: number;
  min_purchase_amount: number | null;
  /** Allow-list of category ids the coupon applies to; null/empty = all.
   *  Drives the client-side eligible-subtotal scoping. */
  category_ids: string[] | null;
}

/** Admin row for the coupons table. Mirrors the DB shape. */
export interface CouponRow {
  id: string;
  code: string;
  type: CouponType;
  discount_value: number;
  min_purchase_amount: number | null;
  expires_at: string;
  max_uses_per_user: number;
  is_active: boolean;
  /** Allow-list of category ids the coupon applies to; null = all categories. */
  category_ids: string[] | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CouponInsert {
  code: string;
  type: CouponType;
  discount_value: number;
  min_purchase_amount?: number | null;
  expires_at: string;
  max_uses_per_user?: number;
  is_active?: boolean;
  category_ids?: string[] | null;
}

export type CouponUpdate = Partial<Omit<CouponInsert, 'code'>> & {
  code?: string;
  deleted_at?: string | null;
};

// ---- Shipping methods ----

export interface ShippingMethodRow {
  id: string;
  name: string;
  description: string | null;
  requires_address: boolean;
  price: number;
  sort_order: number;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShippingMethodInsert {
  name: string;
  description?: string | null;
  requires_address?: boolean;
  price: number;
  sort_order?: number;
  is_active?: boolean;
}

export type ShippingMethodUpdate = Partial<ShippingMethodInsert> & {
  deleted_at?: string | null;
};

// ---- Static pages (admin-managed CMS) ----

export interface StaticPageRow {
  id: string;
  slug: string;
  title: string;
  content: string;
  meta_description: string | null;
  is_published: boolean;
  sort_order: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaticPageInsert {
  slug: string;
  title: string;
  content?: string;
  meta_description?: string | null;
  is_published?: boolean;
  sort_order?: number;
}

export type StaticPageUpdate = Partial<StaticPageInsert> & {
  deleted_at?: string | null;
};

// ---- Orders ----

export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'shipped'
  | 'completed'
  | 'cancelled';

export type PaymentMethod = 'sinpe_or_transfer' | 'payment_link';

export interface ShippingAddress {
  line1: string;
  line2?: string | null;
  city: string;
  province: string;
  notes?: string | null;
}

export interface OrderRow {
  id: string;
  /** Human-friendly sequential number, e.g. 7300. Display this; UUID `id`
   *  stays the source of truth for foreign keys, URLs, and RPC params. */
  order_number: number;
  user_id: string | null;
  status: OrderStatus;
  customer_email: string;
  customer_name: string;
  customer_phone: string;
  shipping_address: ShippingAddress | null;
  shipping_method_id: string | null;
  shipping_method_name: string;
  shipping_amount: number;
  payment_method: PaymentMethod;
  payment_proof_url: string | null;
  subtotal: number;
  discount_amount: number;
  coupon_id: string | null;
  coupon_code: string | null;
  total: number;
  customer_notes: string | null;
  cancellation_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string | null;
  product_slug: string;
  product_name: string;
  product_image_url: string | null;
  product_condition: string | null;
  product_set_name: string | null;
  product_card_number: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
  created_at: string;
}

/** One order that bought entries for a raffle product. Joined from order_items
 *  (quantity = entries in that order) to its parent order. Admin-only read. */
export interface RaffleBuyerRow {
  order_id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  status: OrderStatus;
  quantity: number;
  created_at: string;
}

/** Input shape for the place_order RPC. */
export interface PlaceOrderInput {
  items: { product_id: string; quantity: number }[];
  buyer: {
    email: string;
    name: string;
    phone: string;
    /** Null when the chosen shipping method has requires_address = false. */
    address: ShippingAddress | null;
  };
  shipping_method_id: string;
  payment_method: PaymentMethod;
  coupon_code?: string;
  customer_notes?: string;
}

/** Result of the place_order RPC. */
export type PlaceOrderResult =
  | { ok: true; order_id: string; total: number }
  | {
      ok: false;
      error: string;
      product_id?: string;
      available?: number;
    };

// Row shape returned by the `products_search` view / `search_products` RPC.
// Mirrors `ProductRow` minus a few admin-only columns and adds the joined
// set fields plus `search_text` / `card_type_names`.
export interface ProductSearchRow {
  id: string;
  slug: string;
  name: string;
  pokemon_name: string | null;
  card_number: string | null;
  rarity: string | null;
  illustrator: string | null;
  regulation_mark: string | null;
  category: string | null;
  stage: string | null;
  type1: string | null;
  type2: string | null;
  legal_standard: boolean | null;
  legal_expanded: boolean | null;
  language: string;
  condition: string | null;
  variant: string | null;
  price: number;
  sale_price: number | null;
  quantity: number;
  image_url: string | null;
  set_id: string | null;
  category_id: string;
  tcgdex_id: string | null;
  last_restocked_at: string | null;
  created_at: string;
  set_name: string | null;
  set_code: string | null;
  card_type_names: string;
  card_type_ids: string[];
  search_text: string;
  set_printed_total: number | null;
}

export type SortKey = 'relevance' | 'price-asc' | 'price-desc' | 'recent';

export const DEFAULT_SORT_WITH_QUERY: SortKey = 'relevance';
export const DEFAULT_SORT_NO_QUERY: SortKey = 'recent';

/**
 * Resolve a raw URL `sort` param to a valid SortKey. `'relevance'` only survives
 * when there's a query (it's meaningless while browsing), otherwise the
 * per-context default applies. Shared by /products and /buscar.
 */
export function normalizeSort(raw: string | null | undefined, hasQuery: boolean): SortKey {
  if (raw === 'price-asc' || raw === 'price-desc' || raw === 'recent') return raw;
  if (raw === 'relevance' && hasQuery) return 'relevance';
  return hasQuery ? DEFAULT_SORT_WITH_QUERY : DEFAULT_SORT_NO_QUERY;
}

export type ProductUpdate = Partial<Omit<ProductInsert, 'category_id'>> & {
  category_id?: string;
};

export type ConditionCode = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';
export type LanguageCode = 'EN' | 'ES' | 'JP';

// Keys mirror the booleans on TCGdex's `card.variants` object so we can map
// directly between the API response and the stored value.
export type VariantCode =
  | 'normal'
  | 'holo'
  | 'reverse'
  | 'firstEdition'
  | 'wPromo';

export const CONDITION_OPTIONS: readonly { value: ConditionCode; label: string }[] = [
  { value: 'NM', label: 'NM — Near Mint' },
  { value: 'LP', label: 'LP — Lightly Played' },
  { value: 'MP', label: 'MP — Moderately Played' },
  { value: 'HP', label: 'HP — Heavily Played' },
  { value: 'DMG', label: 'DMG — Damaged' },
];

export const LANGUAGE_OPTIONS: readonly { value: LanguageCode; label: string }[] = [
  { value: 'EN', label: 'Inglés' },
  { value: 'ES', label: 'Español' },
  { value: 'JP', label: 'Japonés' },
];

export const VARIANT_OPTIONS: readonly { value: VariantCode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'holo', label: 'Holo' },
  { value: 'reverse', label: 'Reverse Holo' },
  { value: 'firstEdition', label: '1ª edición' },
  { value: 'wPromo', label: 'Promo' },
];

export interface AppSettingsRow {
  id: true;
  exchange_rate_usd_crc: number | null;
  maintenance_mode: boolean;
  maintenance_message: string | null;
  sinpe_phone: string | null;
  whatsapp_number: string | null;
  bank_account_info: string | null;
  order_notification_recipients: string;
  updated_at: string;
}

export type AppSettingsUpdate = Partial<
  Pick<
    AppSettingsRow,
    | 'exchange_rate_usd_crc'
    | 'maintenance_mode'
    | 'maintenance_message'
    | 'sinpe_phone'
    | 'whatsapp_number'
    | 'bank_account_info'
    | 'order_notification_recipients'
  >
>;
