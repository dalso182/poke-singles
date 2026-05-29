-- Loyalty points — Phase 1: earning, reversal, balance & admin report.
--
-- Customers earn points when an order reaches the payment-confirmed state
-- (status = 'paid'). The ratio is configurable: `loyalty_colones_per_point`
-- colones of net merchandise (subtotal − discount, shipping excluded) earn 1
-- point. If a *paid* order is later cancelled, the awarded points are reversed —
-- and because balance is just SUM(amount) over a ledger, that reversal may push
-- the balance negative when the points were already spent (allowed by design).
--
-- A single AFTER UPDATE OF status trigger on `orders` covers both paths: the
-- forward pending→paid transition (a direct PostgREST UPDATE from the admin
-- order screen) and cancellation (cancel_order's final UPDATE). No app/RPC
-- change needed. Guests (orders.user_id IS NULL) have no account and are
-- skipped. Redemption / the points shop is a later phase — only 'earn' and
-- 'reversal' rows are written here ('adjust' is reserved for manual fixes).

-- ─── Settings ───────────────────────────────────────────────────────────────
alter table public.app_settings
  add column loyalty_enabled           boolean       not null default false,
  add column loyalty_colones_per_point numeric(12,2) not null default 1000;

comment on column public.app_settings.loyalty_colones_per_point is
  'Colones of net merchandise (subtotal − discount) that earn 1 point. 1000 = 1 pt per ₡1000.';

-- ─── Ledger ─────────────────────────────────────────────────────────────────
create table public.loyalty_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  order_id    uuid references public.orders(id) on delete set null,
  amount      integer not null,          -- + earned, − reversed (later: − redeemed)
  kind        text not null check (kind in ('earn', 'reversal', 'adjust')),
  description text,
  created_at  timestamptz not null default now()
);

create index loyalty_transactions_user_created_idx
  on public.loyalty_transactions (user_id, created_at desc);
create index loyalty_transactions_order_idx
  on public.loyalty_transactions (order_id);

alter table public.loyalty_transactions enable row level security;

-- Customers read their own ledger (balance + history on /account). Admin sees
-- everything (the report). No customer INSERT path — only the security-definer
-- trigger writes rows.
create policy loyalty_self_read on public.loyalty_transactions
  for select using (user_id = auth.uid());
create policy loyalty_admin_all on public.loyalty_transactions
  for all using (public.is_admin()) with check (public.is_admin());

-- ─── Award / reverse trigger ──────────────────────────────────────────────────
create or replace function public.award_or_reverse_loyalty_points()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_enabled   boolean;
  v_per_point numeric;
  v_points    integer;
  v_earned    integer;
begin
  -- Guests have no account to credit.
  if new.user_id is null then
    return new;
  end if;

  select loyalty_enabled, loyalty_colones_per_point
    into v_enabled, v_per_point
  from public.app_settings where id = true;

  -- AWARD: first time the order enters 'paid' (payment confirmed).
  if new.status = 'paid' and old.status is distinct from 'paid' then
    if coalesce(v_enabled, false)
       and not exists (
         select 1 from public.loyalty_transactions
         where order_id = new.id and kind = 'earn'
       )
    then
      v_points := floor(
        greatest(new.subtotal - coalesce(new.discount_amount, 0), 0)
        / nullif(v_per_point, 0)
      )::int;
      if v_points > 0 then
        insert into public.loyalty_transactions (user_id, order_id, amount, kind, description)
        values (new.user_id, new.id, v_points, 'earn', 'Compra #' || new.order_number);
      end if;
    end if;
  end if;

  -- REVERSAL: a paid order is cancelled — claw back exactly what it earned.
  -- Independent of the enabled flag (don't strand points from when it was on)
  -- and of current balance (may go negative if already spent). Once only.
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    select coalesce(sum(amount), 0) into v_earned
    from public.loyalty_transactions
    where order_id = new.id and kind = 'earn';

    if v_earned > 0
       and not exists (
         select 1 from public.loyalty_transactions
         where order_id = new.id and kind = 'reversal'
       )
    then
      insert into public.loyalty_transactions (user_id, order_id, amount, kind, description)
      values (new.user_id, new.id, -v_earned, 'reversal', 'Cancelación #' || new.order_number);
    end if;
  end if;

  return new;
end;
$$;

create trigger orders_loyalty_points
after update of status on public.orders
for each row
execute function public.award_or_reverse_loyalty_points();

-- ─── Admin report RPC ─────────────────────────────────────────────────────────
-- Every points transaction, newest-first, with customer + source-order context.
-- Admin-only (security definer + is_admin guard); mirrors admin_coupons_report's
-- shape (window count for pagination, CR-local date filtering on created_at).
create or replace function public.admin_loyalty_transactions_report(
  p_search     text default '',
  p_date_start date default null,
  p_date_end   date default null,
  p_limit      int  default 50,
  p_offset     int  default 0,
  p_sort       text default 'created'   -- 'created' (newest, default) | 'amount'
)
returns table (
  id             uuid,
  user_id        uuid,
  customer_name  text,
  customer_email text,
  order_id       uuid,
  order_number   int,
  amount         integer,
  kind           text,
  description    text,
  created_at     timestamptz,
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
    lt.id,
    lt.user_id,
    p.full_name           as customer_name,
    u.email::text         as customer_email,
    lt.order_id,
    o.order_number,
    lt.amount,
    lt.kind,
    lt.description,
    lt.created_at,
    count(*) over()       as total_count
  from public.loyalty_transactions lt
  left join public.profiles p on p.id = lt.user_id
  left join auth.users     u on u.id = lt.user_id
  left join public.orders  o on o.id = lt.order_id
  where (p_search = ''
     or u.email ilike '%' || p_search || '%'
     or p.full_name ilike '%' || p_search || '%')
    and (p_date_start is null
         or (lt.created_at at time zone 'America/Costa_Rica')::date >= p_date_start)
    and (p_date_end is null
         or (lt.created_at at time zone 'America/Costa_Rica')::date <= p_date_end)
  order by
    case when p_sort = 'amount' then lt.amount end desc nulls last,
    lt.created_at desc
  limit p_limit offset p_offset;
end;
$$;

grant execute on function public.admin_loyalty_transactions_report(text, date, date, int, int, text)
  to authenticated;
