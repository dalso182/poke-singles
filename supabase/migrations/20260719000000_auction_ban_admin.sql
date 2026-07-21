-- Admin control for the auctions-only ban (profiles.auction_banned_at, added
-- in 20260717000000): a setter RPC plus surfacing the flag on both customer
-- admin RPCs so /admin/customers can show and toggle it.
--
-- admin_customers RETURNS TABLE gains a column → the return type changes, so
-- CREATE OR REPLACE is not allowed: drop then recreate (same rule as
-- 20260525002500). admin_customer returns jsonb → CREATE OR REPLACE is fine;
-- recreated verbatim from its LATEST definition (20260704120000, the pokedex
-- version) plus the two ban fields.

-- Set / clear the ban. Banning stamps auction_banned_at + optional reason;
-- unbanning clears both. place_bid checks the flag; existing bids stay valid
-- (the close flow independently skips banned bidders when picking a winner).
create or replace function public.admin_set_auction_ban(
  p_user_id uuid,
  p_banned  boolean,
  p_reason  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_banned_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  update public.profiles
  set auction_banned_at  = case when p_banned then coalesce(auction_banned_at, now()) end,
      auction_ban_reason = case when p_banned then p_reason end
  where id = p_user_id
  returning auction_banned_at into v_banned_at;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'CUSTOMER_NOT_FOUND');
  end if;

  return jsonb_build_object('ok', true, 'auction_banned_at', v_banned_at);
end;
$$;

grant execute on function public.admin_set_auction_ban(uuid, boolean, text) to authenticated;

-- List RPC: add auction_banned_at (pill on /admin/customers rows).
drop function if exists public.admin_customers(text, int, int, text);

create or replace function public.admin_customers(
  p_search text default '',
  p_limit  int  default 25,
  p_offset int  default 0,
  p_sort   text default 'created'  -- 'created' (by signup) | 'active' (by last login)
)
returns table (
  id                uuid,
  full_name         text,
  email             text,
  phone             text,
  created_at        timestamptz,
  last_sign_in_at   timestamptz,
  order_count       bigint,
  total_spent       numeric,
  last_order_at     timestamptz,
  auction_banned_at timestamptz,
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
    p.id,
    p.full_name,
    u.email::text,
    p.phone,
    p.created_at,
    u.last_sign_in_at,
    coalesce(agg.order_count, 0)::bigint as order_count,
    coalesce(agg.total_spent, 0)         as total_spent,
    agg.last_order_at,
    p.auction_banned_at,
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

-- Detail RPC: add auction_banned_at + auction_ban_reason.
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
    'orders',                   coalesce(ord.orders, '[]'::jsonb),
    'loyalty_balance',          coalesce(loy.balance, 0),
    'loyalty_transactions',     coalesce(ltx.transactions, '[]'::jsonb),
    'caught_pokemon_numbers',   to_jsonb(p.caught_pokemon_numbers),
    'auction_banned_at',        p.auction_banned_at,
    'auction_ban_reason',       p.auction_ban_reason
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
  left join lateral (
    select sum(lt.amount) as balance
    from public.loyalty_transactions lt
    where lt.user_id = p.id
  ) loy on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id',          t.id,
        'user_id',     t.user_id,
        'order_id',    t.order_id,
        'amount',      t.amount,
        'kind',        t.kind,
        'description', t.description,
        'created_at',  t.created_at
      ) order by t.created_at desc
    ) as transactions
    from (
      select *
      from public.loyalty_transactions t2
      where t2.user_id = p.id
      order by t2.created_at desc
      limit 100
    ) t
  ) ltx on true
  where p.id = p_id;

  return result;
end;
$$;

grant execute on function public.admin_customer(uuid) to authenticated;
