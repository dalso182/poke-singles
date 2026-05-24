-- Payment gate: a raffle can't be drawn while any non-cancelled entry order is
-- still 'pending' (unpaid). Once all are paid (or cancelled), the draw proceeds
-- among PAID entries only. Otherwise identical to the previous draw_raffle.

create or replace function public.draw_raffle(p_product_id uuid)
returns public.raffles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_raffle boolean;
  v_row     public.raffles;
  v_oid     uuid;
  v_name    text;
  v_email   text;
  v_winning int;
  v_total   int;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select (category_id = public.raffle_category_id())
    into v_is_raffle
    from public.products where id = p_product_id;
  if v_is_raffle is distinct from true then
    raise exception 'NOT_A_RAFFLE';
  end if;

  -- Ensure a row exists, then lock it. Idempotent: if already drawn/void, return.
  insert into public.raffles (product_id) values (p_product_id)
    on conflict (product_id) do nothing;
  select * into v_row from public.raffles where product_id = p_product_id for update;
  if v_row.status <> 'scheduled' then
    return v_row;
  end if;

  -- Block the draw while any entry order is still unpaid (pending).
  if exists (
    select 1 from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.product_id = p_product_id and o.status = 'pending'
  ) then
    raise exception 'UNPAID_ENTRIES';
  end if;

  -- Uniform pick over per-entry rows = weighted by quantity. Only PAID orders
  -- are eligible (pending is blocked above; cancelled returned their entries).
  with entries as (
    select o.id as order_id, o.customer_name, o.customer_email,
           row_number() over (order by o.created_at, oi.id, g.n) as entry_no,
           count(*) over () as total
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    cross join lateral generate_series(1, oi.quantity) as g(n)
    where oi.product_id = p_product_id
      and o.status in ('paid', 'shipped', 'completed')
  )
  select order_id, customer_name, customer_email, entry_no, total
    into v_oid, v_name, v_email, v_winning, v_total
  from entries
  order by random()
  limit 1;

  update public.raffles set
    status          = case when v_oid is null then 'void' else 'drawn' end,
    winner_order_id = v_oid,
    winner_name     = v_name,
    winner_email    = v_email,
    winning_entry   = v_winning,
    total_entries   = coalesce(v_total, 0),
    drawn_by        = auth.uid(),
    drawn_at        = now()
  where product_id = p_product_id
  returning * into v_row;

  return v_row;
end;
$$;
