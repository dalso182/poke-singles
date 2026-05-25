-- Coupons Report (admin "Reportes" → Cupones). Per-coupon usage: how many orders
-- used each coupon, the total discount given through it, and the total revenue of
-- those orders. Port of OpenCart's Coupons Report. Admin-only (security definer +
-- is_admin guard) since it aggregates every order.
--
-- Usage is read from public.orders (it carries coupon_id, discount_amount, total,
-- status). All three figures are computed over the SAME non-cancelled set so the
-- row reconciles: those N orders gave X discount and Y revenue. Only coupons used
-- in range are returned (it's a usage report); soft-deleted coupons are included
-- so history stays complete. Mirrors admin_customer_orders_report's shape.

create or replace function public.admin_coupons_report(
  p_search     text default '',
  p_date_start date default null,
  p_date_end   date default null,
  p_limit      int  default 50,
  p_offset     int  default 0,
  p_sort       text default 'discount'  -- 'discount' (default) | 'revenue' | 'orders'
)
returns table (
  id             uuid,
  name           text,
  code           text,
  order_count    bigint,
  total_discount numeric,
  total_revenue  numeric,
  total_count    bigint
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
    c.id,
    c.name,
    c.code,
    coalesce(agg.order_count, 0)::bigint as order_count,
    coalesce(agg.total_discount, 0)      as total_discount,
    coalesce(agg.total_revenue, 0)       as total_revenue,
    count(*) over()                      as total_count
  from public.coupons c
  left join lateral (
    select
      count(*)              as order_count,
      sum(o.discount_amount) as total_discount,
      sum(o.total)          as total_revenue
    from public.orders o
    where o.coupon_id = c.id
      and o.status <> 'cancelled'
      and (p_date_start is null
           or (o.created_at at time zone 'America/Costa_Rica')::date >= p_date_start)
      and (p_date_end is null
           or (o.created_at at time zone 'America/Costa_Rica')::date <= p_date_end)
  ) agg on true
  where (p_search = ''
     or c.code ilike '%' || p_search || '%'
     or c.name ilike '%' || p_search || '%')
    and coalesce(agg.order_count, 0) > 0
  order by
    case when p_sort = 'revenue' then coalesce(agg.total_revenue, 0) end desc nulls last,
    case when p_sort = 'orders'  then coalesce(agg.order_count, 0)   end desc nulls last,
    coalesce(agg.total_discount, 0) desc
  limit p_limit offset p_offset;
end;
$$;

grant execute on function public.admin_coupons_report(text, date, date, int, int, text)
  to authenticated;
