-- Admin "Clientes" data: registered accounts (profiles joined to auth.users for
-- email) enriched with order activity. Admin-only (security definer + is_admin
-- guard) because it reads auth.users — which is not exposed over PostgREST —
-- and aggregates every customer's orders.
--
-- order_count / total_spent mirror the dashboard's revenue semantics: count
-- excludes cancelled orders; total_spent counts only realized revenue
-- (paid/shipped/completed). A customer's orders are matched by user_id OR a
-- case-insensitive email match, so checkouts placed while logged out still
-- attach to the account.

-- Paginated, searchable list. count(*) over() carries the filtered total so the
-- client can drive its paginator from the first row.
create or replace function public.admin_customers(
  p_search text default '',
  p_limit  int  default 25,
  p_offset int  default 0
)
returns table (
  id            uuid,
  full_name     text,
  email         text,
  phone         text,
  created_at    timestamptz,
  order_count   bigint,
  total_spent   numeric,
  last_order_at timestamptz,
  total_count   bigint
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
    p.phone,
    p.created_at,
    coalesce(agg.order_count, 0)::bigint as order_count,
    coalesce(agg.total_spent, 0)         as total_spent,
    agg.last_order_at,
    count(*) over()                      as total_count
  from public.profiles p
  join auth.users u on u.id = p.id
  left join lateral (
    select
      count(*) filter (where o.status <> 'cancelled')                        as order_count,
      sum(o.total) filter (where o.status in ('paid', 'shipped', 'completed')) as total_spent,
      max(o.created_at) filter (where o.status <> 'cancelled')               as last_order_at
    from public.orders o
    where o.user_id = p.id or lower(o.customer_email) = lower(u.email)
  ) agg on true
  where p_search = ''
     or p.full_name ilike '%' || p_search || '%'
     or u.email     ilike '%' || p_search || '%'
     or p.phone     ilike '%' || p_search || '%'
  order by p.created_at desc
  limit p_limit offset p_offset;
end;
$$;

grant execute on function public.admin_customers(text, int, int) to authenticated;

-- Single-customer detail: profile + email + saved address + the same stats,
-- plus the 100 most recent orders (incl. cancelled, so history reads complete).
-- Returns null when no profile matches p_id.
create or replace function public.admin_customer(p_id uuid)
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

  select jsonb_build_object(
    'id',                       p.id,
    'full_name',                p.full_name,
    'email',                    u.email,
    'phone',                    p.phone,
    'created_at',               p.created_at,
    'default_shipping_address', p.default_shipping_address,
    'order_count',              coalesce(agg.order_count, 0),
    'total_spent',              coalesce(agg.total_spent, 0),
    'last_order_at',            agg.last_order_at,
    'orders',                   coalesce(ord.orders, '[]'::jsonb)
  )
  into result
  from public.profiles p
  join auth.users u on u.id = p.id
  left join lateral (
    select
      count(*) filter (where o.status <> 'cancelled')                        as order_count,
      sum(o.total) filter (where o.status in ('paid', 'shipped', 'completed')) as total_spent,
      max(o.created_at) filter (where o.status <> 'cancelled')               as last_order_at
    from public.orders o
    where o.user_id = p.id or lower(o.customer_email) = lower(u.email)
  ) agg on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id',             o.id,
        'order_number',   o.order_number,
        'status',         o.status,
        'total',          o.total,
        'payment_method', o.payment_method,
        'created_at',     o.created_at
      ) order by o.created_at desc
    ) as orders
    from (
      select *
      from public.orders o2
      where o2.user_id = p.id or lower(o2.customer_email) = lower(u.email)
      order by o2.created_at desc
      limit 100
    ) o
  ) ord on true
  where p.id = p_id;

  return result;
end;
$$;

grant execute on function public.admin_customer(uuid) to authenticated;
