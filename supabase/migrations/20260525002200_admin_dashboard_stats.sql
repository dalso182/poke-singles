-- Admin dashboard headline stats + a 30-day daily series for the trend
-- sparklines. One jsonb payload so the dashboard makes a single round trip.
-- Admin-only (security definer + is_admin guard) since it aggregates orders,
-- revenue, and customer counts across all rows.
--
-- "total_sales" = realized revenue: only paid/shipped/completed orders count
-- (pending isn't money in the bank, cancelled is reversed). "total_orders"
-- and the per-day series exclude cancelled orders for the same reason.
--
-- Day boundaries use America/Costa_Rica (UTC-6, no DST) so buckets line up
-- with the store's local calendar — matching how the dashboard component
-- already reasons about "today".

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
