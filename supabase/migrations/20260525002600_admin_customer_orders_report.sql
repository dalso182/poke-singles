-- Customer Orders Report (admin "Reportes" → Pedidos por cliente). Per-customer
-- order aggregation: # orders, # products, total spent — the new-stack port of
-- OpenCart's Customer Orders Report. Admin-only (security definer + is_admin
-- guard) since it reads auth.users and aggregates every customer's orders.
--
-- Mirrors admin_customers' semantics so the numbers reconcile with the Clientes
-- screen and the dashboard: orders are matched by user_id OR a case-insensitive
-- email match (so logged-out checkouts still attach to the account); order_count
-- excludes cancelled; total_spent counts only realized revenue
-- (paid/shipped/completed). no_products sums order_items.quantity across the
-- customer's non-cancelled orders.
--
-- Differences from admin_customers: an optional created_at date range (CR-day
-- boundaries, matching admin_dashboard_stats), default sort by total spent
-- (OpenCart's order), and only customers with at least one order in scope are
-- returned (it's an *orders* report, not the full account list).

create or replace function public.admin_customer_orders_report(
  p_search     text default '',
  p_date_start date default null,
  p_date_end   date default null,
  p_limit      int  default 25,
  p_offset     int  default 0,
  p_sort       text default 'total'  -- 'total' (default) | 'orders' | 'created'
)
returns table (
  id          uuid,
  full_name   text,
  email       text,
  order_count bigint,
  no_products bigint,
  total_spent numeric,
  total_count bigint
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
    p.id,
    p.full_name,
    u.email::text,
    coalesce(agg.order_count, 0)::bigint  as order_count,
    coalesce(prod.no_products, 0)::bigint as no_products,
    coalesce(agg.total_spent, 0)          as total_spent,
    count(*) over()                       as total_count
  from public.profiles p
  join auth.users u on u.id = p.id
  -- Order-level aggregate (kept separate from the item-level one so summing
  -- o.total isn't multiplied by the order's line count).
  left join lateral (
    select
      count(*) filter (where o.status <> 'cancelled')                         as order_count,
      sum(o.total) filter (where o.status in ('paid', 'shipped', 'completed')) as total_spent
    from public.orders o
    where (o.user_id = p.id or lower(o.customer_email) = lower(u.email))
      and (p_date_start is null
           or (o.created_at at time zone 'America/Costa_Rica')::date >= p_date_start)
      and (p_date_end is null
           or (o.created_at at time zone 'America/Costa_Rica')::date <= p_date_end)
  ) agg on true
  -- Item-level aggregate: total units bought across non-cancelled orders.
  left join lateral (
    select sum(oi.quantity) as no_products
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where (o.user_id = p.id or lower(o.customer_email) = lower(u.email))
      and o.status <> 'cancelled'
      and (p_date_start is null
           or (o.created_at at time zone 'America/Costa_Rica')::date >= p_date_start)
      and (p_date_end is null
           or (o.created_at at time zone 'America/Costa_Rica')::date <= p_date_end)
  ) prod on true
  where (p_search = ''
     or p.full_name ilike '%' || p_search || '%'
     or u.email     ilike '%' || p_search || '%'
     or p.phone     ilike '%' || p_search || '%')
    -- It's an orders report: drop accounts with no orders in scope.
    and coalesce(agg.order_count, 0) > 0
  order by
    case when p_sort = 'orders'  then coalesce(agg.order_count, 0) end desc nulls last,
    case when p_sort = 'created' then p.created_at end                desc nulls last,
    coalesce(agg.total_spent, 0) desc
  limit p_limit offset p_offset;
end;
$$;

grant execute on function public.admin_customer_orders_report(text, date, date, int, int, text)
  to authenticated;
