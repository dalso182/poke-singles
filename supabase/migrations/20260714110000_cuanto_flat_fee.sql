-- Cuanto flat fee: payment-link orders also cost a flat ₡115 per ORDER, which
-- reduces the seller payout. The fee splits across the seller's consigned
-- SEALED items in that order, per unit, rounded to whole colones per line
-- (agreed 2026-07-14): share = round(115 × line_qty / total_consigned_sealed
-- _units_in_order). House items never absorb a share — a lone consigned item
-- takes the full ₡115. Mixed sellers are out of scope (one seller per order
-- assumed). Rounding drift is accepted (3 × qty-1 lines → 38+38+38 = ₡114).
--
-- The share folds into cuanto_fee (5% + share) — no new columns, so the report
-- RPC keeps its RETURNS TABLE shape and the client needs no type changes.
-- Existing seller_payouts batches keep their frozen totals; only unpaid items
-- recompute under the new rule.

-- ============================================================
-- Fee function — new signature (drop first: avoid an overload)
-- ============================================================

drop function public.sealed_payout_fees(numeric, int, text);

create function public.sealed_payout_fees(
  p_unit_price         numeric,
  p_quantity           int,
  p_payment_method     text,
  -- Total consigned sealed units in the parent order (the ₡115 divisor).
  -- NULL/0 → this line is treated as the whole group (absorbs the full fee).
  p_order_seller_units int default null,
  out cuanto_fee numeric,
  out store_fee  numeric,
  out payout     numeric
)
language plpgsql
immutable
as $$
declare
  v_line  numeric := p_unit_price * p_quantity;
  v_units int     := coalesce(nullif(p_order_seller_units, 0), p_quantity);
begin
  cuanto_fee := case
    when p_payment_method = 'payment_link'
      then round(v_line * 0.05) + round(115.0 * p_quantity / v_units)
    else 0
  end;
  -- Tier is per UNIT: two ₡20.000 units owe ₡1.000 each, regardless of the
  -- ₡40.000 line total.
  store_fee := (case
    when p_unit_price < 15000 then 0
    when p_unit_price < 30000 then 1000
    when p_unit_price < 80000 then 2000
    else round(p_unit_price * 0.05)
  end) * p_quantity;
  payout := v_line - cuanto_fee - store_fee;
end;
$$;

-- ============================================================
-- Report RPC — body-only refresh (adds the divisor lateral)
-- ============================================================

create or replace function public.admin_sealed_payouts_report(
  p_seller_id    uuid    default null,
  p_pending_only boolean default true,
  p_date_start   date    default null,
  p_date_end     date    default null,
  p_limit        int     default 50,
  p_offset       int     default 0
)
returns table (
  item_id           uuid,
  order_id          uuid,
  order_number      int,
  order_created_at  timestamptz,
  order_status      text,
  payment_method    text,
  product_name      text,
  product_slug      text,
  product_image_url text,
  product_set_name  text,
  product_card_number text,
  seller_id         uuid,
  seller_code       text,
  seller_name       text,
  quantity          int,
  unit_price        numeric,
  line_total        numeric,
  cuanto_fee        numeric,
  store_fee         numeric,
  payout_amount     numeric,
  seller_payout_id  uuid,
  payout_paid_at    timestamptz,
  total_count       bigint
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
    oi.id,
    o.id,
    o.order_number,
    o.created_at,
    o.status,
    o.payment_method,
    oi.product_name,
    oi.product_slug,
    oi.product_image_url,
    oi.product_set_name,
    oi.product_card_number,
    oi.seller_id,
    oi.seller_code,
    oi.seller_name,
    oi.quantity,
    oi.unit_price,
    oi.line_total,
    f.cuanto_fee,
    f.store_fee,
    f.payout,
    oi.seller_payout_id,
    sp.created_at,
    count(*) over()
  from public.order_items oi
  join public.orders o      on o.id = oi.order_id
  join public.products p    on p.id = oi.product_id
  join public.categories c  on c.id = p.category_id and c.slug = 'sellado'
  left join public.seller_payouts sp on sp.id = oi.seller_payout_id
  -- ₡115 divisor: ALL the seller's consigned sealed units in this order,
  -- regardless of paid status — paying 2 of 3 items leaves the third with
  -- its own fixed share.
  cross join lateral (
    select coalesce(sum(oi2.quantity), oi.quantity)::int as units
    from public.order_items oi2
    join public.products p2   on p2.id = oi2.product_id
    join public.categories c2 on c2.id = p2.category_id and c2.slug = 'sellado'
    where oi2.order_id = oi.order_id and oi2.seller_id is not null
  ) sib
  cross join lateral
    public.sealed_payout_fees(oi.unit_price, oi.quantity, o.payment_method, sib.units) f
  where oi.seller_id is not null
    and (p_seller_id is null or oi.seller_id = p_seller_id)
    and case when p_pending_only
          -- pending: unpaid item on a realized order
          then oi.seller_payout_id is null
               and o.status in ('paid', 'shipped', 'completed')
          -- all: realized items plus anything already batched (a paid batch
          -- stays visible even if its order is later cancelled)
          else oi.seller_payout_id is not null
               or o.status in ('paid', 'shipped', 'completed')
        end
    and (p_date_start is null
         or (o.created_at at time zone 'America/Costa_Rica')::date >= p_date_start)
    and (p_date_end is null
         or (o.created_at at time zone 'America/Costa_Rica')::date <= p_date_end)
  order by o.created_at desc, oi.id
  limit p_limit offset p_offset;
end;
$$;

grant execute on function
  public.admin_sealed_payouts_report(uuid, boolean, date, date, int, int)
  to authenticated;

-- ============================================================
-- Summary RPC — body-only refresh (same divisor)
-- ============================================================

create or replace function public.admin_sealed_pending_totals()
returns table (
  seller_id      uuid,
  seller_code    text,
  seller_name    text,
  item_count     bigint,
  pending_sold   numeric,
  pending_payout numeric
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
    oi.seller_id,
    s.code,
    s.name,
    count(*)::bigint,
    coalesce(sum(oi.line_total), 0),
    coalesce(sum(f.payout), 0)
  from public.order_items oi
  join public.orders o      on o.id = oi.order_id
  join public.products p    on p.id = oi.product_id
  join public.categories c  on c.id = p.category_id and c.slug = 'sellado'
  join public.sellers s     on s.id = oi.seller_id
  cross join lateral (
    select coalesce(sum(oi2.quantity), oi.quantity)::int as units
    from public.order_items oi2
    join public.products p2   on p2.id = oi2.product_id
    join public.categories c2 on c2.id = p2.category_id and c2.slug = 'sellado'
    where oi2.order_id = oi.order_id and oi2.seller_id is not null
  ) sib
  cross join lateral
    public.sealed_payout_fees(oi.unit_price, oi.quantity, o.payment_method, sib.units) f
  where oi.seller_id is not null
    and oi.seller_payout_id is null
    and o.status in ('paid', 'shipped', 'completed')
  group by oi.seller_id, s.code, s.name
  order by coalesce(sum(f.payout), 0) desc;
end;
$$;

grant execute on function public.admin_sealed_pending_totals() to authenticated;

-- ============================================================
-- Mutation RPC — body-only refresh (freeze uses the same divisor)
-- ============================================================

create or replace function public.create_seller_payout(
  p_item_ids uuid[],
  p_notes    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids        uuid[];
  v_seller_id  uuid;
  v_code       text;
  v_name       text;
  v_total_sold numeric(12,2);
  v_cuanto     numeric(12,2);
  v_store      numeric(12,2);
  v_payout     numeric(12,2);
  v_count      int;
  v_payout_id  uuid;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'NOT_ADMIN');
  end if;

  -- Dedupe defensively — a double-submitted id must not double-count.
  select array_agg(distinct x) into v_ids from unnest(p_item_ids) x;
  if v_ids is null then
    return jsonb_build_object('ok', false, 'error', 'NO_ITEMS');
  end if;

  -- Lock parent orders first (stable id order) so a concurrent cancel_order —
  -- which locks the order row — serializes against us, then lock the items.
  -- Validations run after the locks so two admins can't both pass them.
  perform 1 from public.orders o
   where o.id in (select oi.order_id from public.order_items oi
                   where oi.id = any(v_ids))
   order by o.id
   for update;

  perform 1 from public.order_items oi
   where oi.id = any(v_ids)
   order by oi.id
   for update;

  select count(*) into v_count from public.order_items where id = any(v_ids);
  if v_count <> cardinality(v_ids) then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  if exists (select 1 from public.order_items
              where id = any(v_ids) and seller_id is null) then
    return jsonb_build_object('ok', false, 'error', 'NO_SELLER');
  end if;

  select count(distinct seller_id) into v_count
    from public.order_items where id = any(v_ids);
  if v_count > 1 then
    return jsonb_build_object('ok', false, 'error', 'MIXED_SELLERS');
  end if;

  if exists (select 1 from public.order_items
              where id = any(v_ids) and seller_payout_id is not null) then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_PAID');
  end if;

  if exists (select 1
               from public.order_items oi
               join public.orders o on o.id = oi.order_id
              where oi.id = any(v_ids)
                and o.status not in ('paid', 'shipped', 'completed')) then
    return jsonb_build_object('ok', false, 'error', 'ORDER_NOT_REALIZED');
  end if;

  -- Sealed-only guard (v1): the fee math below is the sealed rule set. Also
  -- rejects items whose product was deleted (null product_id → no category).
  if exists (select 1
               from public.order_items oi
               left join public.products pr  on pr.id = oi.product_id
               left join public.categories c on c.id = pr.category_id
              where oi.id = any(v_ids)
                and coalesce(c.slug, '') <> 'sellado') then
    return jsonb_build_object('ok', false, 'error', 'NOT_SEALED');
  end if;

  -- Freeze the breakdown via the shared fee function (incl. the ₡115 share).
  select oi.seller_id, s.code, s.name,
         sum(oi.line_total), sum(f.cuanto_fee), sum(f.store_fee), sum(f.payout),
         count(*)::int
    into v_seller_id, v_code, v_name,
         v_total_sold, v_cuanto, v_store, v_payout,
         v_count
  from public.order_items oi
  join public.orders o  on o.id = oi.order_id
  join public.sellers s on s.id = oi.seller_id
  cross join lateral (
    select coalesce(sum(oi2.quantity), oi.quantity)::int as units
    from public.order_items oi2
    join public.products p2   on p2.id = oi2.product_id
    join public.categories c2 on c2.id = p2.category_id and c2.slug = 'sellado'
    where oi2.order_id = oi.order_id and oi2.seller_id is not null
  ) sib
  cross join lateral
    public.sealed_payout_fees(oi.unit_price, oi.quantity, o.payment_method, sib.units) f
  where oi.id = any(v_ids)
  group by oi.seller_id, s.code, s.name;

  insert into public.seller_payouts
    (seller_id, seller_code, seller_name,
     total_sold, cuanto_fees, store_fees, total, item_count,
     notes, created_by)
  values
    (v_seller_id, v_code, v_name,
     v_total_sold, v_cuanto, v_store, v_payout, v_count,
     nullif(btrim(coalesce(p_notes, '')), ''), auth.uid())
  returning id into v_payout_id;

  update public.order_items
     set seller_payout_id = v_payout_id
   where id = any(v_ids);

  return jsonb_build_object(
    'ok', true,
    'payout_id', v_payout_id,
    'seller_id', v_seller_id,
    'seller_name', v_name,
    'item_count', v_count,
    'total_sold', v_total_sold,
    'cuanto_fees', v_cuanto,
    'store_fees', v_store,
    'total', v_payout
  );
end;
$$;

grant execute on function public.create_seller_payout(uuid[], text)
  to authenticated;
