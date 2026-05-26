-- Adds `inventory_value` to the dashboard stats payload: the total monetary
-- value of stock still sittable on the shelf — sum(price * quantity) over
-- products that are active AND still in stock. Hidden (active = false) and
-- out-of-stock (quantity = 0) SKUs don't represent realizable inventory, so
-- they don't count.
--
-- Re-declares admin_dashboard_stats() so the dashboard keeps making a single
-- round trip. Everything else (guard, daily series, other totals) is unchanged
-- from 20260525002200_admin_dashboard_stats.sql.

create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  with bounds as (
    select (now() at time zone 'America/Costa_Rica')::date as today
  ),
  day_series as (
    select (b.today - 29) + g as d
    from bounds b, generate_series(0, 29) as g
  ),
  daily as (
    select
      (o.created_at at time zone 'America/Costa_Rica')::date as d,
      count(*)                                                          as orders,
      sum(o.total) filter (where o.status in ('paid', 'shipped', 'completed')) as sales
    from public.orders o, bounds b
    where (o.created_at at time zone 'America/Costa_Rica')::date >= b.today - 29
      and o.status <> 'cancelled'
    group by 1
  )
  select jsonb_build_object(
    'total_orders',    (select count(*) from public.orders where status <> 'cancelled'),
    'total_sales',     coalesce(
                         (select sum(total) from public.orders
                          where status in ('paid', 'shipped', 'completed')), 0),
    'total_customers', (select count(*) from public.profiles),
    'pending_orders',  (select count(*) from public.orders where status = 'pending'),
    'inventory_value', coalesce(
                         (select sum(price * quantity) from public.products
                          where active = true and quantity > 0), 0),
    'series', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'd',      to_char(ds.d, 'YYYY-MM-DD'),
          'orders', coalesce(dy.orders, 0),
          'sales',  coalesce(dy.sales, 0)
        ) order by ds.d)
      from day_series ds
      left join daily dy on dy.d = ds.d
    ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$$;

grant execute on function public.admin_dashboard_stats() to authenticated;
