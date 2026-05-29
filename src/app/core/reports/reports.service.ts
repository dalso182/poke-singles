import { Injectable, WritableSignal, inject } from '@angular/core';
import type { Card } from '@tcgdex/sdk';
import { SupabaseService } from '../supabase/supabase.service';
import { AppSettingsService } from '../settings/app-settings.service';
import { TcgdexService } from '../tcgdex/tcgdex.service';
import {
  firstTcgplayerVariant,
  tcgplayerMarketUsd,
  tcgplayerUpdatedAt,
} from '../catalog/tcgplayer-pricing';
import type {
  CouponReportParams,
  CouponReportResult,
  CouponReportRow,
  CustomerActivityParams,
  CustomerActivityResult,
  CustomerActivityRow,
  CustomerOrdersReportParams,
  CustomerOrdersReportResult,
  CustomerOrdersReportRow,
  CustomerSearchParams,
  CustomerSearchResult,
  CustomerSearchRow,
  LoyaltyReportParams,
  LoyaltyReportResult,
  LoyaltyReportRow,
  PriceReviewCard,
  PriceReviewProgress,
  PriceReviewSummary,
} from '../catalog/catalog.types';

/** Raw row from admin_customer_orders_report() — bigint/numeric aggregates may
 *  arrive as strings, so we coerce on the way out. Carries total_count. */
interface OrdersReportRpcRow extends Omit<
  CustomerOrdersReportRow,
  'order_count' | 'no_products' | 'total_spent'
> {
  order_count: number | string;
  no_products: number | string;
  total_spent: number | string;
  total_count: number | string;
}

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly supabase = inject(SupabaseService);
  private readonly settings = inject(AppSettingsService);
  private readonly tcgdex = inject(TcgdexService);

  /**
   * Cached lookup of the "singles" category id — used by the price-review
   * runner to scope checks to actual TCG card singles (excluding sealed
   * products, accessories, etc.). The category-by-slug pattern is the same
   * one add-product.ts uses to pick the default singles category. Lazy +
   * memoized per service instance: at-most one query per session.
   */
  private _singlesCategoryIdPromise: Promise<string> | null = null;
  private singlesCategoryId(): Promise<string> {
    if (!this._singlesCategoryIdPromise) {
      this._singlesCategoryIdPromise = (async () => {
        const { data, error } = await (this.supabase.client as any)
          .from('categories')
          .select('id')
          .eq('slug', 'singles')
          .maybeSingle();
        if (error) throw error;
        if (!data?.id) throw new Error('SINGLES_CATEGORY_MISSING');
        return data.id as string;
      })();
    }
    return this._singlesCategoryIdPromise;
  }

  /** Admin "Pedidos por cliente" report. Backed by the
   *  admin_customer_orders_report RPC (security definer + is_admin guard). */
  async listCustomerOrders(
    params: CustomerOrdersReportParams = {},
  ): Promise<CustomerOrdersReportResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(200, params.pageSize ?? 25));
    const { data, error } = await (this.supabase.client as any).rpc(
      'admin_customer_orders_report',
      {
        p_search: params.search?.trim() ?? '',
        p_date_start: params.dateStart ?? null,
        p_date_end: params.dateEnd ?? null,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
        p_sort: params.sort ?? 'total',
      },
    );
    if (error) {
      console.error('[reports] admin_customer_orders_report', error);
      throw error;
    }
    const rpcRows = (data ?? []) as OrdersReportRpcRow[];
    const rows: CustomerOrdersReportRow[] = rpcRows.map((r) => ({
      id: r.id,
      full_name: r.full_name,
      email: r.email,
      order_count: Number(r.order_count) || 0,
      no_products: Number(r.no_products) || 0,
      total_spent: Number(r.total_spent) || 0,
    }));
    // total_count is identical across rows (window aggregate); 0 on empty page.
    const total = rpcRows.length > 0 ? Number(rpcRows[0].total_count) || 0 : 0;
    return { rows, total, page, pageSize };
  }

  /** Admin "Actividad de clientes" report. Backed by the
   *  admin_customer_activity RPC (security definer + is_admin guard). */
  async listCustomerActivity(
    params: CustomerActivityParams = {},
  ): Promise<CustomerActivityResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(200, params.pageSize ?? 50));
    const { data, error } = await (this.supabase.client as any).rpc(
      'admin_customer_activity',
      {
        p_search: params.search?.trim() ?? '',
        p_date_start: params.dateStart ?? null,
        p_date_end: params.dateEnd ?? null,
        p_ip: params.ip?.trim() ?? '',
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      },
    );
    if (error) {
      console.error('[reports] admin_customer_activity', error);
      throw error;
    }
    const rpcRows = (data ?? []) as (CustomerActivityRow & {
      total_count: number | string;
    })[];
    const rows: CustomerActivityRow[] = rpcRows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      customer_name: r.customer_name,
      customer_email: r.customer_email,
      event_type: r.event_type,
      order_id: r.order_id,
      ip: r.ip,
      created_at: r.created_at,
    }));
    const total = rpcRows.length > 0 ? Number(rpcRows[0].total_count) || 0 : 0;
    return { rows, total, page, pageSize };
  }

  /** Admin "Búsquedas" report. Backed by the admin_customer_searches RPC
   *  (security definer + is_admin guard). */
  async listCustomerSearches(
    params: CustomerSearchParams = {},
  ): Promise<CustomerSearchResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(200, params.pageSize ?? 50));
    const { data, error } = await (this.supabase.client as any).rpc(
      'admin_customer_searches',
      {
        p_search: params.search?.trim() ?? '',
        p_keyword: params.keyword?.trim() ?? '',
        p_date_start: params.dateStart ?? null,
        p_date_end: params.dateEnd ?? null,
        p_ip: params.ip?.trim() ?? '',
        p_customer_type: params.customerType ?? 'all',
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      },
    );
    if (error) {
      console.error('[reports] admin_customer_searches', error);
      throw error;
    }
    const rpcRows = (data ?? []) as (CustomerSearchRow & {
      total_count: number | string;
    })[];
    const rows: CustomerSearchRow[] = rpcRows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      customer_name: r.customer_name,
      customer_email: r.customer_email,
      keyword: r.keyword,
      found_count: Number(r.found_count) || 0,
      category_name: r.category_name,
      ip: r.ip,
      created_at: r.created_at,
    }));
    const total = rpcRows.length > 0 ? Number(rpcRows[0].total_count) || 0 : 0;
    return { rows, total, page, pageSize };
  }

  /** Admin "Cupones" report. Backed by the admin_coupons_report RPC
   *  (security definer + is_admin guard). */
  async listCoupons(params: CouponReportParams = {}): Promise<CouponReportResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(200, params.pageSize ?? 50));
    const { data, error } = await (this.supabase.client as any).rpc(
      'admin_coupons_report',
      {
        p_search: params.search?.trim() ?? '',
        p_date_start: params.dateStart ?? null,
        p_date_end: params.dateEnd ?? null,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
        p_sort: params.sort ?? 'discount',
      },
    );
    if (error) {
      console.error('[reports] admin_coupons_report', error);
      throw error;
    }
    const rpcRows = (data ?? []) as (CouponReportRow & {
      total_count: number | string;
    })[];
    const rows: CouponReportRow[] = rpcRows.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      order_count: Number(r.order_count) || 0,
      total_discount: Number(r.total_discount) || 0,
      total_revenue: Number(r.total_revenue) || 0,
    }));
    const total = rpcRows.length > 0 ? Number(rpcRows[0].total_count) || 0 : 0;
    return { rows, total, page, pageSize };
  }

  /** Admin "Puntos" report. Backed by the admin_loyalty_transactions_report RPC
   *  (security definer + is_admin guard). Lists every points ledger entry. */
  async listLoyaltyTransactions(
    params: LoyaltyReportParams = {},
  ): Promise<LoyaltyReportResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(200, params.pageSize ?? 50));
    const { data, error } = await (this.supabase.client as any).rpc(
      'admin_loyalty_transactions_report',
      {
        p_search: params.search?.trim() ?? '',
        p_date_start: params.dateStart ?? null,
        p_date_end: params.dateEnd ?? null,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
        p_sort: params.sort ?? 'created',
      },
    );
    if (error) {
      console.error('[reports] admin_loyalty_transactions_report', error);
      throw error;
    }
    const rpcRows = (data ?? []) as (LoyaltyReportRow & {
      total_count: number | string;
    })[];
    const rows: LoyaltyReportRow[] = rpcRows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      customer_name: r.customer_name,
      customer_email: r.customer_email,
      order_id: r.order_id,
      order_number: r.order_number == null ? null : Number(r.order_number),
      amount: Number(r.amount) || 0,
      kind: r.kind,
      description: r.description,
      created_at: r.created_at,
    }));
    const total = rpcRows.length > 0 ? Number(rpcRows[0].total_count) || 0 : 0;
    return { rows, total, page, pageSize };
  }

  // ─── "Precios fuera de rango" ───────────────────────────────────────────
  // Card-by-card triage queue. The same `price_reviews` rows are populated by
  // both this client-side runner and the price-check Edge Function (cron),
  // so the screen reads them identically regardless of trigger.

  /** Header counts + the latest run for the "última ejecución" label. */
  async priceReviewSummary(): Promise<PriceReviewSummary> {
    const { data, error } = await (this.supabase.client as any).rpc(
      'admin_price_review_summary',
    );
    if (error) {
      console.error('[reports] admin_price_review_summary', error);
      throw error;
    }
    const row = Array.isArray(data) ? data[0] : data;
    return {
      pending_count: Number(row?.pending_count) || 0,
      total_flagged: Number(row?.total_flagged) || 0,
      last_run_id: row?.last_run_id ?? null,
      last_run_trigger: row?.last_run_trigger ?? null,
      last_run_started: row?.last_run_started ?? null,
      last_run_finished: row?.last_run_finished ?? null,
      last_run_scanned: row?.last_run_scanned ?? null,
      last_run_priced: row?.last_run_priced ?? null,
      last_run_flagged: row?.last_run_flagged ?? null,
    };
  }

  /** Highest |diff_pct| pending card; null when the queue is empty. */
  async priceReviewNext(): Promise<PriceReviewCard | null> {
    const { data, error } = await (this.supabase.client as any).rpc(
      'admin_price_review_next',
    );
    if (error) {
      console.error('[reports] admin_price_review_next', error);
      throw error;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      product_id: row.product_id,
      card_ref: row.card_ref,
      product_name: row.product_name,
      product_slug: row.product_slug,
      image_url: row.image_url,
      set_id: row.set_id,
      set_code: row.set_code,
      set_name: row.set_name,
      card_number: row.card_number,
      language: row.language,
      condition: row.condition,
      variant: row.variant,
      store_price: Number(row.store_price) || 0,
      market_usd: Number(row.market_usd) || 0,
      exchange_rate: Number(row.exchange_rate) || 0,
      market_crc: Number(row.market_crc) || 0,
      suggested_price: Number(row.suggested_price) || 0,
      diff_pct: Number(row.diff_pct) || 0,
      market_updated_at: row.market_updated_at,
      checked_at: row.checked_at,
      tcgplayer_product_id:
        row.tcgplayer_product_id == null ? null : Number(row.tcgplayer_product_id),
    };
  }

  /** Hide the card until the next check rewrites the row. */
  async priceReviewIgnore(productId: string): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc(
      'admin_price_review_ignore',
      { p_product_id: productId },
    );
    if (error) {
      console.error('[reports] admin_price_review_ignore', error);
      throw error;
    }
  }

  /** Commit a new price (may differ from the suggestion) and clear the row. */
  async priceReviewAccept(productId: string, newPrice: number): Promise<void> {
    const { error } = await (this.supabase.client as any).rpc(
      'admin_price_review_accept',
      { p_product_id: productId, p_new_price: newPrice },
    );
    if (error) {
      console.error('[reports] admin_price_review_accept', error);
      throw error;
    }
  }

  /**
   * How many products would be considered by a check with this floor —
   * active + has card_ref + condition NM + singles category + price >= floor.
   * Drives the "Se revisarán N cartas" hint on the options panel. Same filter
   * the runner uses for its termination bound, so the count matches scanned.
   */
  async priceReviewQualifyingCount(floor: number): Promise<number> {
    const singlesId = await this.singlesCategoryId();
    const { count, error } = await (this.supabase.client as any)
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('active', true)
      .not('card_ref', 'is', null)
      .eq('condition', 'NM')
      .eq('category_id', singlesId)
      .gte('price', Math.max(0, Number(floor) || 0));
    if (error) {
      console.error('[reports] priceReviewQualifyingCount', error);
      throw error;
    }
    return Number(count) || 0;
  }

  /**
   * Client-side weekly check — reuses the same TCGdex SDK wiring as add-product
   * and the same `admin_record_price_check` RPC the cron Edge Function uses.
   * Pages qualifying products oldest-first (NULLS FIRST), fetches each card
   * with bounded concurrency, and updates `progress` after every card so the
   * UI can show a live chip.
   *
   * `overrides` lets the manual-run options panel try a different threshold /
   * floor for this run without touching app_settings — the persisted values
   * stay whatever they were. Cron path always uses persisted settings.
   *
   * The cursor approach: we always read `range(0, pageSize-1)` because each
   * record-price-check bumps `products.price_checked_at = now()`, so the rows
   * we just processed sink to the end of the NULLS-FIRST ordering. Termination
   * is bound by the initial `total` count, not by paging offset.
   */
  async runPriceReviewNow(
    progress?: WritableSignal<PriceReviewProgress | null>,
    overrides?: { threshold_pct?: number; floor_crc?: number },
  ): Promise<{ runId: string; scanned: number; priced: number; flagged: number }> {
    const settings = await this.settings.get();
    if (!settings.price_review_enabled) {
      throw new Error('PRICE_REVIEW_DISABLED');
    }
    const rate = settings.exchange_rate_usd_crc;
    if (!rate || rate <= 0) {
      throw new Error('NO_EXCHANGE_RATE');
    }
    const threshold = overrides?.threshold_pct ?? settings.price_review_threshold_pct;
    const floor = overrides?.floor_crc ?? settings.price_review_floor_crc;
    const singlesId = await this.singlesCategoryId();

    // Total qualifying = the bound for the loop. We don't trust paging
    // offset because NULLS-FIRST ordering shifts under us. Scope: active
    // singles in NM condition with a card_ref and price >= floor.
    const { count: totalQualifying, error: countErr } = await (this.supabase.client as any)
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('active', true)
      .not('card_ref', 'is', null)
      .eq('condition', 'NM')
      .eq('category_id', singlesId)
      .gte('price', floor);
    if (countErr) throw countErr;
    const total = Number(totalQualifying) || 0;

    const { data: runId, error: startErr } = await (this.supabase.client as any).rpc(
      'admin_price_review_start',
      { p_trigger: 'manual' },
    );
    if (startErr) throw startErr;

    let scanned = 0;
    let priced = 0;
    let flagged = 0;
    progress?.set({ scanned, priced, flagged, total });

    const setProgress = () => progress?.set({ scanned, priced, flagged, total });

    let runError: string | null = null;
    try {
      const pageSize = 50;
      // Hard cap = ceil(total / pageSize) + 2 to guarantee termination even
      // under data races (e.g. an admin adding a product mid-run).
      const maxIterations = Math.ceil(total / pageSize) + 2;
      let iterations = 0;
      const seen = new Set<string>();

      while (scanned < total && iterations < maxIterations) {
        iterations += 1;
        const { data: rows, error: pageErr } = await (this.supabase.client as any)
          .from('products')
          .select('id, card_ref, price')
          .eq('active', true)
          .not('card_ref', 'is', null)
          .eq('condition', 'NM')
          .eq('category_id', singlesId)
          .gte('price', floor)
          .order('price_checked_at', { ascending: true, nullsFirst: true })
          .range(0, pageSize - 1);
        if (pageErr) throw pageErr;
        const batch = (rows ?? []) as { id: string; card_ref: string; price: number }[];
        if (batch.length === 0) break;

        // Filter out rows we've already processed this run — protects against
        // a degenerate ordering where the same row keeps coming back.
        const fresh = batch.filter((r) => !seen.has(r.id));
        if (fresh.length === 0) break;
        for (const r of fresh) seen.add(r.id);

        await this.processConcurrent(fresh, 4, async (row) => {
          let usd = 0;
          let updatedAt: string | null = null;
          let tcgProductId: number | null = null;
          try {
            const card = (await this.tcgdex.client.fetch('cards', row.card_ref)) as Card;
            const variant = firstTcgplayerVariant(card);
            usd = tcgplayerMarketUsd(card) ?? 0;
            updatedAt = tcgplayerUpdatedAt(card);
            tcgProductId =
              typeof variant?.productId === 'number' ? variant.productId : null;
          } catch (e) {
            // TCGdex fetch failure: treat as "no signal" and let the RPC just
            // bump price_checked_at — don't abort the whole run for one card.
            console.warn('[priceReview] tcgdex fetch failed', row.card_ref, e);
          }
          try {
            const { data: wasFlagged, error: recErr } = await (this.supabase.client as any).rpc(
              'admin_record_price_check',
              {
                p_product_id: row.id,
                p_store_price: row.price,
                p_market_usd: usd,
                p_exchange_rate: rate,
                p_threshold_pct: threshold,
                p_market_updated_at: updatedAt,
                p_tcgplayer_product_id: tcgProductId,
              },
            );
            if (recErr) throw recErr;
            scanned += 1;
            if (usd > 0) priced += 1;
            if (wasFlagged === true) flagged += 1;
          } catch (e) {
            console.warn('[priceReview] record_price_check failed', row.id, e);
            scanned += 1;
          }
          setProgress();
        });
      }
    } catch (e) {
      runError = (e as Error)?.message ?? String(e);
    }

    await (this.supabase.client as any).rpc('admin_price_review_finish', {
      p_run_id: runId,
      p_scanned: scanned,
      p_priced: priced,
      p_flagged: flagged,
      p_error: runError,
    });

    if (runError) throw new Error(runError);
    return { runId, scanned, priced, flagged };
  }

  /** Lightweight concurrency-capped Promise.all replacement. */
  private async processConcurrent<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
  ): Promise<void> {
    let cursor = 0;
    const runners: Promise<void>[] = [];
    const next = async (): Promise<void> => {
      while (cursor < items.length) {
        const i = cursor++;
        await worker(items[i]);
      }
    };
    for (let n = 0; n < Math.min(concurrency, items.length); n++) {
      runners.push(next());
    }
    await Promise.all(runners);
  }
}
