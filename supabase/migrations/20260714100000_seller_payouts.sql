-- Consignment seller payouts (sealed rules v1).
--
-- When a consigned product sells, the store owes its seller the sold price
-- minus fees. This migration adds the payout ledger (seller_payouts), the
-- per-item link (order_items.seller_payout_id), the sealed fee math, and the
-- admin RPCs behind Reportes → Consignaciones.
--
-- Fee rules apply to SEALED products only (category slug 'sellado'); singles
-- get their own rules later. Both fees are computed on the sold price
-- independently (no sequential stacking):
--   · Cuanto app: orders paid via 'payment_link' cost 5% of the sold amount.
--   · Store commission, per unit (tier from unit_price, × quantity):
--       < ₡15.000 → ₡0 · 15.000–29.999 → ₡1.000 · 30.000–79.999 → ₡2.000
--       · ≥ ₡80.000 → 5% of unit price.
--   · payout = line_total − cuanto_fee − store_fee. 5% amounts round to the
--     nearest colón.
--
-- An item is payout-eligible once its order is realized (paid/shipped/
-- completed) — same convention as the dashboard. Cancelled orders keep their
-- item snapshots but never show as pending.

-- ============================================================
-- Fee math — single source of truth
-- ============================================================
-- Used by both report RPCs AND create_seller_payout so the displayed
-- breakdown can never drift from what a batch actually freezes.

create or replace function public.sealed_payout_fees(
  p_unit_price     numeric,
  p_quantity       int,
  p_payment_method text,
  out cuanto_fee numeric,
  out store_fee  numeric,
  out payout     numeric
)
language plpgsql
immutable
as $$
declare
  v_line numeric := p_unit_price * p_quantity;
begin
  cuanto_fee := case
    when p_payment_method = 'payment_link' then round(v_line * 0.05)
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
-- Ledger table + item link
-- ============================================================

create table public.seller_payouts (
  id           uuid primary key default gen_random_uuid(),
  -- RESTRICT: a seller with payout history can't be deleted (matches
  -- products.seller_id; there is no seller-delete UI anyway).
  seller_id    uuid not null references public.sellers(id) on delete restrict,
  -- Display snapshots, same idiom as order_items.seller_code/seller_name.
  seller_code  text not null,
  seller_name  text not null,
  -- Breakdown frozen at creation — the authoritative record of what was paid
  -- even if fee rules change later.
  total_sold   numeric(12,2) not null,
  cuanto_fees  numeric(12,2) not null,
  store_fees   numeric(12,2) not null,
  total        numeric(12,2) not null,  -- payout owed = total_sold − fees
  item_count   int not null,
  notes        text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table public.seller_payouts enable row level security;

create policy seller_payouts_admin_all on public.seller_payouts
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create index seller_payouts_seller_idx
  on public.seller_payouts (seller_id, created_at desc);

-- Deleting a batch reverts its items to pending (SET NULL) — that IS the
-- undo path; no separate delete RPC.
alter table public.order_items
  add column seller_payout_id uuid
    references public.seller_payouts(id) on delete set null;

create index order_items_pending_payout_idx
  on public.order_items (seller_id)
  where seller_id is not null and seller_payout_id is null;

create index order_items_payout_idx
  on public.order_items (seller_payout_id)
  where seller_payout_id is not null;

-- ============================================================
-- Report RPC: sold sealed consignment items + fee breakdown
-- ============================================================
-- Sealed-ness is joined live via products → categories (order_items doesn't
-- snapshot the category; products are never hard-deleted by the app).

create or replace function public.admin_sealed_payouts_report(
  p_seller_id    uuid    default null,   -- null = all sellers
  p_pending_only boolean default true,
  p_date_start   date    default null,   -- CR-day on order created_at
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
  cross join lateral
    public.sealed_payout_fees(oi.unit_price, oi.quantity, o.payment_method) f
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
-- Summary RPC: pending payout per seller (header strip)
-- ============================================================
-- Separate from the paginated report so the totals always cover the full
-- pending set (same companion-RPC idiom as the dashboard stats).

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
  cross join lateral
    public.sealed_payout_fees(oi.unit_price, oi.quantity, o.payment_method) f
  where oi.seller_id is not null
    and oi.seller_payout_id is null
    and o.status in ('paid', 'shipped', 'completed')
  group by oi.seller_id, s.code, s.name
  order by coalesce(sum(f.payout), 0) desc;
end;
$$;

grant execute on function public.admin_sealed_pending_totals() to authenticated;

-- ============================================================
-- Mutation RPC: bulk "mark paid" → one payout batch
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

  -- Freeze the breakdown via the shared fee function.
  select oi.seller_id, s.code, s.name,
         sum(oi.line_total), sum(f.cuanto_fee), sum(f.store_fee), sum(f.payout),
         count(*)::int
    into v_seller_id, v_code, v_name,
         v_total_sold, v_cuanto, v_store, v_payout,
         v_count
  from public.order_items oi
  join public.orders o  on o.id = oi.order_id
  join public.sellers s on s.id = oi.seller_id
  cross join lateral
    public.sealed_payout_fees(oi.unit_price, oi.quantity, o.payment_method) f
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
