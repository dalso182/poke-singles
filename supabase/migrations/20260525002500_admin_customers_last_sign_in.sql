-- Expose last_sign_in_at (Supabase Auth's last-login timestamp, already reachable
-- via the auth.users join) on the admin customer RPCs, and let admin_customers
-- sort by it. The dashboard uses this for an "Actividad reciente" panel (most
-- recently active accounts) alongside the existing "Últimos registros" panel
-- (newest sign-ups, by created_at).
--
-- admin_customers gains a p_sort param ('created' default | 'active'). Adding a
-- column to its RETURNS TABLE changes the return type, so CREATE OR REPLACE is
-- not allowed — drop then recreate. The new 4-arg-with-default signature still
-- resolves the existing 3-named-arg call from the /admin/customers screen
-- (p_sort defaults to 'created'), and dropping the old 3-arg function avoids
-- PostgREST overload ambiguity.

drop function if exists public.admin_customers(text, int, int);

create or replace function public.admin_customers(
  p_search text default '',
  p_limit  int  default 25,
  p_offset int  default 0,
  p_sort   text default 'created'  -- 'created' (by signup) | 'active' (by last login)
)
returns table (
  id              uuid,
  full_name       text,
  email           text,
  phone           text,
  created_at      timestamptz,
  last_sign_in_at timestamptz,
  order_count     bigint,
  total_spent     numeric,
  last_order_at   timestamptz,
  total_count     bigint
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
    u.last_sign_in_at,
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
  -- For p_sort='active' the CASE drives the order (last login, nulls last);
  -- for 'created' it's NULL for every row, so it falls through to created_at desc.
  order by
    case when p_sort = 'active' then u.last_sign_in_at end desc nulls last,
    p.created_at desc
  limit p_limit offset p_offset;
end;
$$;

grant execute on function public.admin_customers(text, int, int, text) to authenticated;

-- Detail RPC: surface last_sign_in_at too so CustomerDetail (which extends
-- CustomerRow) stays type-honest. jsonb-returning, so CREATE OR REPLACE is fine.
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
    'last_sign_in_at',          u.last_sign_in_at,
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
