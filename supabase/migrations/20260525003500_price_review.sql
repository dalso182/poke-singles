-- Market-price review queue ("Precios fuera de rango"). Once a week (cron) and
-- on demand (admin button), compare each active product's CRC price to the
-- TCGplayer market price (USD × exchange_rate) and flag the ones off by
-- >= price_review_threshold_pct in either direction, restricted to products
-- priced >= price_review_floor_crc. Flagged rows feed a card-by-card triage
-- surface in /admin/reports: "Ignorar" (hide until the next check) or
-- "Aceptar" (commit a new price, with optional inline edit). Cards lacking
-- TCGplayer pricing in TCGdex are skipped silently — they still get
-- products.price_checked_at advanced so the cursor moves forward.
--
-- Ignore semantics: a row is hidden when ignored_at >= checked_at; the next
-- run upserts the row with ignored_at = NULL and a new checked_at, so a
-- still-out-of-band card naturally re-surfaces. No separate ignored table.
--
-- pg_cron + the weekly schedule live in the follow-on migration
-- (20260525003600_price_review_cron.sql) so a missing extension can't block
-- the core schema from landing on dev.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Settings: threshold %, value floor, on/off. Defaults match the original
--    ask (10% / ₡5 000) but everything tunes from /admin/config.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.app_settings
  add column price_review_threshold_pct numeric(5, 2) not null default 10.00
    check (price_review_threshold_pct > 0 and price_review_threshold_pct <= 100),
  add column price_review_floor_crc    numeric(12, 2) not null default 5000.00
    check (price_review_floor_crc >= 0),
  add column price_review_enabled      boolean not null default true;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. price_reviews — one row per flagged product. Replaced/upserted on each
--    run; deleted when a product comes back inside the threshold band.
-- ────────────────────────────────────────────────────────────────────────────

create table public.price_reviews (
  product_id        uuid primary key references public.products(id) on delete cascade,
  card_ref          text not null,
  store_price       numeric(10, 2) not null,   -- snapshot of products.price at check time
  market_usd        numeric(10, 2) not null,   -- TCGplayer marketPrice (USD) at check time
  exchange_rate     numeric(12, 4) not null,   -- snapshot of app_settings.exchange_rate_usd_crc
  market_crc        numeric(12, 2) not null,   -- market_usd * exchange_rate, rounded to 2dp
  suggested_price   numeric(10, 2) not null,   -- ceil(market_crc / 100) * 100 (same rule as add-product)
  diff_pct          numeric(6, 2) not null,    -- signed: + = store over market, − = store under market
  market_updated_at timestamptz,               -- card.pricing.tcgplayer.updated (when available)
  checked_at        timestamptz not null default now(),
  ignored_at        timestamptz                -- set by Ignorar; cleared on next upsert
);

create index price_reviews_abs_diff_idx
  on public.price_reviews ((abs(diff_pct)) desc);

alter table public.price_reviews enable row level security;

-- Admin-only. Customers must never see this table — it leaks every priced
-- card on the catalog plus the store's relationship to market pricing.
create policy price_reviews_admin_all on public.price_reviews
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 3. price_check_runs — small audit log so the screen can show "última
--    ejecución". One row per check kicked off (manual or cron).
-- ────────────────────────────────────────────────────────────────────────────

create table public.price_check_runs (
  id            uuid primary key default gen_random_uuid(),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  trigger       text not null check (trigger in ('manual', 'cron')),
  scanned_count integer not null default 0,   -- products considered (active, has card_ref, >= floor)
  priced_count  integer not null default 0,   -- of those, TCGdex returned a market price
  flagged_count integer not null default 0,   -- of priced, exceeded threshold
  error         text
);

create index price_check_runs_started_idx
  on public.price_check_runs (started_at desc);

alter table public.price_check_runs enable row level security;

create policy price_check_runs_admin_all on public.price_check_runs
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Cursor column on products so the edge function (and any future batch
--    job) can process oldest-first across multiple invocations if it can't
--    finish a full sweep in one wall-clock window. NULLS FIRST = never-checked
--    items have priority.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.products
  add column price_checked_at timestamptz;

create index products_price_checked_at_idx
  on public.products (price_checked_at nulls first)
  where active and card_ref is not null;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. RPCs. All admin-only via is_admin() guard. Shared between the
--    browser-driven manual run and the edge-function cron run — both paths
--    compute (market_usd, market_updated_at) the same way and hand it off
--    here for the comparison + persistence.
-- ────────────────────────────────────────────────────────────────────────────

-- One product's measurement. Caller supplies the live numbers; the function
-- computes market_crc / suggested_price / diff_pct, decides flag vs. clear,
-- and bumps the cursor. Returns true if the product is currently flagged.
create or replace function public.admin_record_price_check(
  p_product_id        uuid,
  p_store_price       numeric,
  p_market_usd        numeric,
  p_exchange_rate     numeric,
  p_threshold_pct     numeric,
  p_market_updated_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_card_ref       text;
  v_market_crc     numeric(12, 2);
  v_suggested      numeric(10, 2);
  v_diff_pct       numeric(6, 2);
  v_flagged        boolean;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select card_ref into v_card_ref from public.products where id = p_product_id;
  if v_card_ref is null then
    raise exception 'PRODUCT_HAS_NO_CARD_REF';
  end if;

  v_market_crc := round(p_market_usd * p_exchange_rate, 2);
  v_suggested  := ceil(v_market_crc / 100) * 100;
  -- Guard against divide-by-zero; if market_crc <= 0 we treat as "no signal".
  if v_market_crc <= 0 then
    delete from public.price_reviews where product_id = p_product_id;
    update public.products set price_checked_at = now() where id = p_product_id;
    return false;
  end if;
  v_diff_pct := round(((p_store_price - v_market_crc) / v_market_crc) * 100, 2);
  v_flagged  := abs(v_diff_pct) >= p_threshold_pct;

  if v_flagged then
    insert into public.price_reviews (
      product_id, card_ref, store_price, market_usd, exchange_rate,
      market_crc, suggested_price, diff_pct, market_updated_at,
      checked_at, ignored_at
    ) values (
      p_product_id, v_card_ref, p_store_price, p_market_usd, p_exchange_rate,
      v_market_crc, v_suggested, v_diff_pct, p_market_updated_at,
      now(), null
    )
    on conflict (product_id) do update set
      card_ref          = excluded.card_ref,
      store_price       = excluded.store_price,
      market_usd        = excluded.market_usd,
      exchange_rate     = excluded.exchange_rate,
      market_crc        = excluded.market_crc,
      suggested_price   = excluded.suggested_price,
      diff_pct          = excluded.diff_pct,
      market_updated_at = excluded.market_updated_at,
      checked_at        = excluded.checked_at,
      ignored_at        = null;  -- a fresh check un-ignores
  else
    delete from public.price_reviews where product_id = p_product_id;
  end if;

  update public.products set price_checked_at = now() where id = p_product_id;
  return v_flagged;
end;
$$;

grant execute on function public.admin_record_price_check(uuid, numeric, numeric, numeric, numeric, timestamptz)
  to authenticated;

-- Begin a run: insert a price_check_runs row and return its id. The caller
-- (edge function or browser runner) accumulates scanned/priced/flagged
-- counters and calls admin_price_review_finish at the end.
create or replace function public.admin_price_review_start(p_trigger text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_trigger not in ('manual', 'cron') then
    raise exception 'INVALID_TRIGGER';
  end if;
  insert into public.price_check_runs (trigger) values (p_trigger) returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.admin_price_review_start(text) to authenticated;

-- Finalize a run with the accumulated counters (and an optional error).
create or replace function public.admin_price_review_finish(
  p_run_id  uuid,
  p_scanned int,
  p_priced  int,
  p_flagged int,
  p_error   text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  update public.price_check_runs set
    finished_at   = now(),
    scanned_count = p_scanned,
    priced_count  = p_priced,
    flagged_count = p_flagged,
    error         = p_error
  where id = p_run_id;
end;
$$;

grant execute on function public.admin_price_review_finish(uuid, int, int, int, text)
  to authenticated;

-- Header for the review screen: how many are still pending (not ignored in
-- this run), total flagged including ignored, and the latest run for the
-- "última ejecución" line. Single-row result.
create or replace function public.admin_price_review_summary()
returns table (
  pending_count    int,
  total_flagged    int,
  last_run_id      uuid,
  last_run_trigger text,
  last_run_started timestamptz,
  last_run_finished timestamptz,
  last_run_scanned int,
  last_run_priced  int,
  last_run_flagged int
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  return query
  select
    (select count(*)::int from public.price_reviews
       where ignored_at is null or ignored_at < checked_at)            as pending_count,
    (select count(*)::int from public.price_reviews)                   as total_flagged,
    r.id, r.trigger, r.started_at, r.finished_at,
    r.scanned_count, r.priced_count, r.flagged_count
  from (
    select * from public.price_check_runs order by started_at desc limit 1
  ) r
  -- Even when there are no runs yet, we still want to return one row with the
  -- counts so the UI can render the "0 por revisar" empty state cleanly.
  right join (select 1) z on true;
end;
$$;

grant execute on function public.admin_price_review_summary() to authenticated;

-- The next card to triage: highest |diff_pct| first, then oldest checked.
-- Joins the product columns the card UI needs (the set is joined as both
-- id and code for the small set/number label).
create or replace function public.admin_price_review_next()
returns table (
  product_id        uuid,
  card_ref          text,
  product_name      text,
  product_slug      text,
  image_url         text,
  set_id            uuid,
  set_code          text,
  set_name          text,
  card_number       text,
  language          text,
  condition         text,
  variant           text,
  store_price       numeric,
  market_usd        numeric,
  exchange_rate     numeric,
  market_crc        numeric,
  suggested_price   numeric,
  diff_pct          numeric,
  market_updated_at timestamptz,
  checked_at        timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  return query
  select
    pr.product_id, pr.card_ref,
    p.name, p.slug, p.image_url,
    p.set_id, s.code, s.name,
    p.card_number, p.language, p.condition, p.variant,
    pr.store_price, pr.market_usd, pr.exchange_rate,
    pr.market_crc, pr.suggested_price, pr.diff_pct,
    pr.market_updated_at, pr.checked_at
  from public.price_reviews pr
  join public.products p on p.id = pr.product_id
  left join public.sets s on s.id = p.set_id
  where pr.ignored_at is null or pr.ignored_at < pr.checked_at
  order by abs(pr.diff_pct) desc, pr.checked_at asc
  limit 1;
end;
$$;

grant execute on function public.admin_price_review_next() to authenticated;

-- Hide the row until the next check rewrites it.
create or replace function public.admin_price_review_ignore(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  update public.price_reviews
     set ignored_at = now()
   where product_id = p_product_id;
end;
$$;

grant execute on function public.admin_price_review_ignore(uuid) to authenticated;

-- Commit a new price for the product and clear the review row. The new price
-- doesn't have to be inside the threshold band — the admin made the decision;
-- if it's still off, the next weekly check will simply re-flag.
create or replace function public.admin_price_review_accept(
  p_product_id uuid,
  p_new_price  numeric
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_new_price is null or p_new_price <= 0 then
    raise exception 'INVALID_PRICE';
  end if;
  update public.products set price = p_new_price where id = p_product_id;
  delete from public.price_reviews where product_id = p_product_id;
end;
$$;

grant execute on function public.admin_price_review_accept(uuid, numeric) to authenticated;
