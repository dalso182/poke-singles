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
  /** Category this type is scoped to. NULL = global (singles/graded Rareza
   *  tags, multi-select); a category id = single-select sub-type for sealed /
   *  accessories. */
  category_id: string | null;
}

export interface CardTypeInsert {
  slug: string;
  name: string;
  active?: boolean;
  sort_order?: number;
  category_id?: string | null;
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

/** Consignment seller. The house (Poke-Singles) has no row — a product with
 *  `seller_id = null` is house inventory. Admin-only table. */
export interface SellerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** 2-char uppercase code; lowercased when appended to product slugs. */
  code: string;
  active: boolean;
  created_at: string;
}

export interface SellerInsert {
  name: string;
  email?: string | null;
  phone?: string | null;
  code: string;
  active?: boolean;
}

/** `code` is locked after creation: product slugs and order_items snapshots
 *  embed it, so changing it would create silent drift. */
export type SellerUpdate = Partial<Omit<SellerInsert, 'code'>>;

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
  card_ref: string | null;
  illustrator: string | null;
  regulation_mark: string | null;
  category: string | null;
  stage: string | null;
  type1: string | null;
  type2: string | null;
  legal_standard: boolean | null;
  legal_expanded: boolean | null;
  featured: boolean;
  /** Consignment owner; null = house inventory (Poke-Singles). Set at
   *  creation only — never editable afterwards. */
  seller_id: string | null;
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
  card_ref?: string | null;
  illustrator?: string | null;
  regulation_mark?: string | null;
  category?: string | null;
  stage?: string | null;
  type1?: string | null;
  type2?: string | null;
  legal_standard?: boolean | null;
  legal_expanded?: boolean | null;
  featured?: boolean;
  seller_id?: string | null;
}

/** ProductRow plus the joined set's name + printed_total. Returned by
 *  ProductsService.list() so callers that render card meta lines (home
 *  rails, admin tables) don't need a separate fetch for the set. */
export interface ProductListRow extends ProductRow {
  set_name: string | null;
  set_printed_total: number | null;
  seller_code: string | null;
  seller_name: string | null;
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
  variant: string | null;
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
  /** Card condition (NM/LP/MP/HP/DMG); null hides the pill. */
  condition: string | null;
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
  card_ref: string;
  data: unknown;
  fetched_at: string;
}

export interface ProfileRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  default_shipping_address: ShippingAddress | null;
  /** National-dex number of the customer's chosen avatar Pokémon. The artwork
   *  is a static asset (assets/images/avatars/{number}.png); the list it's
   *  picked from is client-side reference data. Null = no avatar chosen. */
  avatar_pokemon_number: number | null;
  /** National-dex numbers the customer has "caught" — their personal Pokédex
   *  collection. Read on /account to render owned (color) vs not-owned (grayed)
   *  Pokémon. SERVER-ONLY writes: column-level grants restrict clients, and the
   *  open_pokeball RPC is the sole write path (the redemption economy would be
   *  cheatable otherwise) — hence not part of ProfileUpdate. */
  caught_pokemon_numbers: number[];
  created_at: string;
  updated_at: string;
}

export type ProfileUpdate = Partial<
  Pick<
    ProfileRow,
    'full_name' | 'phone' | 'default_shipping_address' | 'avatar_pokemon_number'
  >
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

/** Per-line view of how the applied coupon affects one cart line. Built by
 *  CartService.lineCoupon and keyed by product_id so the cart UI can show the
 *  new price on each item and flag the lines a scoped coupon skips. */
export interface LineCoupon {
  /** Line falls within the coupon's category scope (always true when the
   *  coupon has no category targeting). */
  inScope: boolean;
  /** Render a per-line discounted price (PERCENTAGE coupons only). */
  discounted: boolean;
  /** In scope but no per-line price change — used to highlight the lines a
   *  FIXED_ON_THRESHOLD coupon counts toward its threshold. */
  highlight: boolean;
  /** Amount taken off this line's total (0 when not discounted). */
  lineDiscount: number;
  /** line.price * quantity − lineDiscount. */
  netLineTotal: number;
  /** Display-only per-unit price after the discount. */
  netUnit: number;
}

/** Admin row for the coupons table. Mirrors the DB shape. */
export interface CouponRow {
  id: string;
  code: string;
  /** Optional friendly label shown in the admin list + Coupons report. */
  name: string | null;
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
  name?: string | null;
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
  /** Allow-list of category ids this method serves; empty = all categories. */
  allowed_category_ids: string[];
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
  allowed_category_ids?: string[];
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

// ---- Announcements (admin-managed login/visit modals) ----

export interface AnnouncementRow {
  id: string;
  title: string;
  body_html: string;
  image_url: string | null;
  link_path: string | null;
  link_label: string | null;
  is_active: boolean;
  view_count: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnnouncementInsert {
  title: string;
  body_html?: string;
  image_url?: string | null;
  link_path?: string | null;
  link_label?: string | null;
  is_active?: boolean;
}

export type AnnouncementUpdate = Partial<AnnouncementInsert> & {
  deleted_at?: string | null;
};

export interface AnnouncementReadRow {
  announcement_id: string;
  user_id: string;
  seen_at: string;
}

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
  /** Last "Recordar pago" reminder email, stamped by the
   *  send-payment-reminder edge function. Null = never sent. */
  payment_reminder_at: string | null;
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
  /** Consignment snapshot (place_order v10). All null = house inventory. */
  seller_id: string | null;
  seller_code: string | null;
  seller_name: string | null;
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

// ---- Admin dashboard ----

/** One day in the dashboard 30-day trend (Costa Rica calendar). `orders` and
 *  `sales` exclude cancelled orders; `sales` further counts only realized
 *  revenue (paid/shipped/completed). */
export interface DashboardDailyBucket {
  /** ISO date, YYYY-MM-DD. */
  d: string;
  orders: number;
  sales: number;
}

/** Payload of the admin_dashboard_stats() RPC — headline KPIs plus the
 *  30-day series that drives the trend sparklines. */
export interface DashboardStats {
  total_orders: number;
  total_sales: number;
  total_customers: number;
  pending_orders: number;
  /** Money currently sitting in stock: sum(price * quantity) over products
   *  where active = true AND quantity > 0. */
  inventory_value: number;
  series: DashboardDailyBucket[];
}

// ---- Admin customers ----

/** One row of the admin_customers() RPC: a registered account (profile +
 *  auth.users email) with order activity. `total_spent` is realized revenue and
 *  `order_count` excludes cancelled orders (matching the dashboard semantics). */
export interface CustomerRow {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  order_count: number;
  total_spent: number;
  last_order_at: string | null;
}

/** A customer's order as embedded in the detail RPC payload (lightweight — not
 *  the full OrderRow). */
export interface CustomerOrderRow {
  id: string;
  order_number: number;
  status: OrderStatus;
  total: number;
  payment_method: PaymentMethod;
  created_at: string;
}

/** Payload of the admin_customer() RPC — full profile + stats + recent orders,
 *  plus the Poke-Monedas balance and recent ledger entries (newest-first) and
 *  the customer's Pokédex collection (national-dex numbers). */
export interface CustomerDetail extends CustomerRow {
  default_shipping_address: ShippingAddress | null;
  orders: CustomerOrderRow[];
  loyalty_balance: number;
  loyalty_transactions: LoyaltyTransactionRow[];
  caught_pokemon_numbers: number[];
}

/** One row of admin_pokedex_leaderboard(): a customer ranked by Pokémon caught. */
export interface PokedexLeaderboardRow {
  id: string;
  full_name: string | null;
  email: string;
  caught_count: number;
}

export interface AdminCustomerListParams {
  search?: string;
  page?: number;
  pageSize?: number;
  /** Row ordering: 'created' (newest sign-ups, default) or 'active' (last login). */
  sort?: 'created' | 'active';
}

export interface AdminCustomerListResult {
  rows: CustomerRow[];
  total: number;
  page: number;
  pageSize: number;
}

// ---- Admin reports ----

/** One row of admin_customer_orders_report(): a customer with order activity in
 *  scope. `order_count` excludes cancelled; `total_spent` is realized revenue;
 *  `no_products` is total units bought across non-cancelled orders. */
export interface CustomerOrdersReportRow {
  id: string;
  full_name: string | null;
  email: string;
  order_count: number;
  no_products: number;
  total_spent: number;
}

export interface CustomerOrdersReportParams {
  search?: string;
  /** Inclusive ISO date (YYYY-MM-DD), filtering orders by CR-local created_at. */
  dateStart?: string | null;
  dateEnd?: string | null;
  page?: number;
  pageSize?: number;
  /** 'total' (spent, default) | 'orders' (count) | 'created' (signup date). */
  sort?: 'total' | 'orders' | 'created';
}

export interface CustomerOrdersReportResult {
  rows: CustomerOrdersReportRow[];
  total: number;
  page: number;
  pageSize: number;
}

export type CustomerActivityEvent = 'login' | 'order_created' | 'registered';

/** One row of admin_customer_activity(): a recorded customer event with the
 *  client IP (text form, may be null) and timestamp. */
export interface CustomerActivityRow {
  id: string;
  user_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  event_type: CustomerActivityEvent;
  order_id: string | null;
  ip: string | null;
  created_at: string;
}

export interface CustomerActivityParams {
  /** Matches customer name or email (ilike contains). */
  search?: string;
  dateStart?: string | null;
  dateEnd?: string | null;
  /** IP prefix match (e.g. "190.171"). */
  ip?: string;
  page?: number;
  pageSize?: number;
}

export interface CustomerActivityResult {
  rows: CustomerActivityRow[];
  total: number;
  page: number;
  pageSize: number;
}

export type SearchCustomerType = 'all' | 'registered' | 'guest';

/** One row of admin_customer_searches(): a committed storefront search with its
 *  match count and who searched (customer_name/email null = guest). */
export interface CustomerSearchRow {
  id: string;
  user_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  keyword: string;
  found_count: number;
  category_name: string | null;
  ip: string | null;
  created_at: string;
}

export interface CustomerSearchParams {
  /** Matches customer name or email (ilike contains). */
  search?: string;
  /** Matches the searched keyword (ilike contains). */
  keyword?: string;
  /** IP prefix match (e.g. "190.171"). */
  ip?: string;
  dateStart?: string | null;
  dateEnd?: string | null;
  customerType?: SearchCustomerType;
  page?: number;
  pageSize?: number;
}

export interface CustomerSearchResult {
  rows: CustomerSearchRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** One row of admin_coupons_report(): a coupon with its usage. `total_discount`
 *  is the discount given through it; `total_revenue` is the orders' total — both
 *  over the same non-cancelled orders that used the coupon. */
export interface CouponReportRow {
  id: string;
  name: string | null;
  code: string;
  order_count: number;
  total_discount: number;
  total_revenue: number;
}

export interface CouponReportParams {
  /** Matches coupon code or name (ilike contains). */
  search?: string;
  dateStart?: string | null;
  dateEnd?: string | null;
  /** 'discount' (given, default) | 'revenue' (orders' total) | 'orders' (count). */
  sort?: 'discount' | 'revenue' | 'orders';
  page?: number;
  pageSize?: number;
}

export interface CouponReportResult {
  rows: CouponReportRow[];
  total: number;
  page: number;
  pageSize: number;
}

// ---- Loyalty points ----

export type LoyaltyTransactionKind = 'earn' | 'reversal' | 'adjust' | 'redeem';

/** One row of the customer-facing loyalty ledger (RLS-scoped to self). `amount`
 *  is signed: positive earned, negative reversed/(later) redeemed. Balance is
 *  the SUM of `amount` across a user's rows — may be negative. */
export interface LoyaltyTransactionRow {
  id: string;
  user_id: string;
  order_id: string | null;
  amount: number;
  kind: LoyaltyTransactionKind;
  description: string | null;
  created_at: string;
}

/** One row of admin_loyalty_transactions_report(): a ledger entry with the
 *  customer and source-order context joined in. */
export interface LoyaltyReportRow {
  id: string;
  user_id: string;
  customer_name: string | null;
  customer_email: string | null;
  order_id: string | null;
  order_number: number | null;
  amount: number;
  kind: LoyaltyTransactionKind;
  description: string | null;
  created_at: string;
}

export interface LoyaltyReportParams {
  /** Matches customer name or email (ilike contains). */
  search?: string;
  dateStart?: string | null;
  dateEnd?: string | null;
  /** 'created' (newest, default) | 'amount' (largest first). */
  sort?: 'created' | 'amount';
  page?: number;
  pageSize?: number;
}

export interface LoyaltyReportResult {
  rows: LoyaltyReportRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** One Pokéball tier from app_settings.pokeball_tiers — the single source of
 *  truth for the redemption economy: the modal displays these numbers and the
 *  open_pokeball RPC enforces them. Styling (colors) stays client-side. */
export interface PokeballTier {
  key: string;
  /** Display name; also used in the ledger description ("Pokébola: …"). */
  label: string;
  /** Price in Poke-Monedas. */
  cost: number;
  /** How many random not-owned Pokémon this ball awards. */
  award: number;
}

/** Result of the open_pokeball RPC. Business failures come back as
 *  `{ ok: false, error }` (INSUFFICIENT_POINTS | POKEDEX_COMPLETE |
 *  UNKNOWN_TIER | NOT_AUTHENTICATED | NO_PROFILE | RPC_ERROR). */
export interface PokeballOpenResult {
  ok: boolean;
  error?: string;
  /** National-dex numbers awarded (on success). */
  awarded?: number[];
  new_balance?: number;
}

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
  card_ref: string | null;
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
// Browse listings (/products, /categoria, /ofertas, query-less /buscar) default
// to highest price first.
export const DEFAULT_SORT_NO_QUERY: SortKey = 'price-desc';

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

// `seller_id` is excluded outright: the seller is fixed at creation (a
// duplicate card from another seller becomes a new product).
export type ProductUpdate = Partial<Omit<ProductInsert, 'category_id' | 'seller_id'>> & {
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
  /** Whether the weekly price-review check runs (cron + manual button). */
  price_review_enabled: boolean;
  /** Deviation threshold (e.g. 10.00 = 10%) above which a card lands in the review queue. */
  price_review_threshold_pct: number;
  /** Only products with `price >= this floor` (CRC) are considered for review. */
  price_review_floor_crc: number;
  /** Whether orders award loyalty points when they reach the 'paid' state. */
  loyalty_enabled: boolean;
  /** Colones of net merchandise (subtotal − discount) that earn 1 point. 1000 = 1 pt/₡1000. */
  loyalty_colones_per_point: number;
  /** Pokéball redemption tiers (cost/award per ball) — see PokeballTier. */
  pokeball_tiers: PokeballTier[];
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
    | 'price_review_enabled'
    | 'price_review_threshold_pct'
    | 'price_review_floor_crc'
    | 'loyalty_enabled'
    | 'loyalty_colones_per_point'
  >
>;

// ─── Price-review report ───────────────────────────────────────────────────

/** One card being reviewed in the "Precios fuera de rango" triage screen. */
export interface PriceReviewCard {
  product_id: string;
  card_ref: string;
  product_name: string;
  product_slug: string;
  image_url: string | null;
  set_id: string | null;
  set_code: string | null;
  set_name: string | null;
  card_number: string | null;
  language: string | null;
  condition: string | null;
  variant: string | null;
  /** Snapshot of `products.price` (CRC) at check time. */
  store_price: number;
  /** TCGplayer marketPrice (USD) at check time. */
  market_usd: number;
  /** Snapshot of the USD→CRC exchange rate at check time. */
  exchange_rate: number;
  /** market_usd × exchange_rate, rounded to 2dp. */
  market_crc: number;
  /** market_crc rounded up to the nearest ₡100 (same rule as add-product). */
  suggested_price: number;
  /** Signed: positive = store above market, negative = store below market. */
  diff_pct: number;
  /** `card.pricing.tcgplayer.updated` when present — for "as of …" UI labels. */
  market_updated_at: string | null;
  checked_at: string;
  /** Snapshot of `card.pricing.tcgplayer.<variant>.productId` — used to build the
   *  TCGplayer deep link. Null when the card has no TCGplayer mapping. */
  tcgplayer_product_id: number | null;
}

/** Header data for the price-review screen (one row, always present). */
export interface PriceReviewSummary {
  /** Cards still awaiting a decision in the current run. */
  pending_count: number;
  /** All flagged cards including those ignored — useful as a denominator. */
  total_flagged: number;
  last_run_id: string | null;
  last_run_trigger: 'manual' | 'cron' | null;
  last_run_started: string | null;
  last_run_finished: string | null;
  last_run_scanned: number | null;
  last_run_priced: number | null;
  last_run_flagged: number | null;
}

/** Live progress published by the client-side `runPriceReviewNow()` runner. */
export interface PriceReviewProgress {
  scanned: number;
  priced: number;
  flagged: number;
  total: number;
}
