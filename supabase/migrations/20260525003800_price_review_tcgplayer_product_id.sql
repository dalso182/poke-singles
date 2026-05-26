-- Snapshot the TCGplayer product id alongside the rest of the price-review
-- row so the admin screen can deep-link to https://www.tcgplayer.com/product/<id>
-- without re-fetching the TCGdex payload. The id is stable per printing —
-- snapshotting it matches how we already snapshot store_price, market_usd,
-- and exchange_rate (the row is self-contained).
--
-- Both `admin_record_price_check` and `admin_price_review_next` need the
-- updated shape. The previous signatures are DROPped and re-created (CREATE
-- OR REPLACE can't change a function's parameter list or return-table shape).
-- Callers pass the new arg/get the new column transparently — no other RPC
-- changes.

alter table public.price_reviews
  add column tcgplayer_product_id integer;

-- ─── admin_record_price_check (now takes p_tcgplayer_product_id) ───────────

drop function if exists public.admin_record_price_check(uuid, numeric, numeric, numeric, numeric, timestamptz);

create or replace function public.admin_record_price_check(
  p_product_id           uuid,
  p_store_price          numeric,
  p_market_usd           numeric,
  p_exchange_rate        numeric,
  p_threshold_pct        numeric,
  p_market_updated_at    timestamptz,
  p_tcgplayer_product_id integer default null
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_card_ref   text;
  v_market_crc numeric(12, 2);
  v_suggested  numeric(10, 2);
  v_diff_pct   numeric(6, 2);
  v_flagged    boolean;
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
  if v_market_crc is null or v_market_crc <= 0 then
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
      tcgplayer_product_id, checked_at, ignored_at
    ) values (
      p_product_id, v_card_ref, p_store_price, p_market_usd, p_exchange_rate,
      v_market_crc, v_suggested, v_diff_pct, p_market_updated_at,
      p_tcgplayer_product_id, now(), null
    )
    on conflict (product_id) do update set
      card_ref             = excluded.card_ref,
      store_price          = excluded.store_price,
      market_usd           = excluded.market_usd,
      exchange_rate        = excluded.exchange_rate,
      market_crc           = excluded.market_crc,
      suggested_price      = excluded.suggested_price,
      diff_pct             = excluded.diff_pct,
      market_updated_at    = excluded.market_updated_at,
      tcgplayer_product_id = excluded.tcgplayer_product_id,
      checked_at           = excluded.checked_at,
      ignored_at           = null;
  else
    delete from public.price_reviews where product_id = p_product_id;
  end if;

  update public.products set price_checked_at = now() where id = p_product_id;
  return v_flagged;
end;
$$;

grant execute on function public.admin_record_price_check(uuid, numeric, numeric, numeric, numeric, timestamptz, integer)
  to authenticated;

-- ─── admin_price_review_next (now returns tcgplayer_product_id) ────────────

drop function if exists public.admin_price_review_next();

create or replace function public.admin_price_review_next()
returns table (
  product_id           uuid,
  card_ref             text,
  product_name         text,
  product_slug         text,
  image_url            text,
  set_id               uuid,
  set_code             text,
  set_name             text,
  card_number          text,
  language             text,
  condition            text,
  variant              text,
  store_price          numeric,
  market_usd           numeric,
  exchange_rate        numeric,
  market_crc           numeric,
  suggested_price      numeric,
  diff_pct             numeric,
  market_updated_at    timestamptz,
  checked_at           timestamptz,
  tcgplayer_product_id integer
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
    pr.market_updated_at, pr.checked_at,
    pr.tcgplayer_product_id
  from public.price_reviews pr
  join public.products p on p.id = pr.product_id
  left join public.sets s on s.id = p.set_id
  where pr.ignored_at is null or pr.ignored_at < pr.checked_at
  order by abs(pr.diff_pct) desc, pr.checked_at asc
  limit 1;
end;
$$;

grant execute on function public.admin_price_review_next() to authenticated;
