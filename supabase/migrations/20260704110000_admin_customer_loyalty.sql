-- Surface the Poke-Monedas ledger on the admin customer detail: the balance
-- (SUM of loyalty_transactions.amount — derived, can legitimately be negative
-- after a reversal) and the 100 most recent ledger rows, so /admin/customers/:id
-- can show the same balance + history the customer sees in /account.
--
-- Ledger rows are keyed by user_id only (NOT NULL, no guest path), so unlike
-- orders there is no email fallback. The transactions array emits exactly the
-- LoyaltyTransactionRow field set the storefront already uses, so the client
-- type is reused verbatim. jsonb-returning → CREATE OR REPLACE is fine.

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
    'loyalty_transactions',     coalesce(ltx.transactions, '[]'::jsonb)
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
