-- Customer activity log — the data behind the admin "Reportes" → Actividad de
-- clientes report (port of OpenCart's Customer Activity Report). One row per
-- recorded customer event (logged in / created an order / registered) with the
-- client IP and a timestamp.
--
-- Writes only ever happen through SECURITY DEFINER functions (log_activity for
-- login/registered, place_order for order_created) and reads only through the
-- admin report RPC, so the table has RLS enabled with NO policies — locked down
-- to everyone except the definer functions and is_admin RPCs.

create table public.customer_activity (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users (id) on delete set null,
  -- Name/email snapshot so the log still reads right if the account is renamed
  -- or deleted.
  customer_name  text,
  customer_email text,
  event_type     text not null check (event_type in ('login', 'order_created', 'registered')),
  order_id       uuid references public.orders (id) on delete set null,
  ip             inet,
  created_at     timestamptz not null default now()
);

create index customer_activity_created_idx on public.customer_activity (created_at desc);
create index customer_activity_user_idx    on public.customer_activity (user_id);

alter table public.customer_activity enable row level security;
-- (intentionally no policies — see header)

-- Best-effort client IP from PostgREST's forwarded request headers. PostgREST
-- exposes the incoming HTTP headers via the request.headers GUC; the Supabase
-- gateway sets x-forwarded-for (may be a comma list — take the first hop).
-- Returns null when unavailable or unparseable, so callers never error on it.
-- Only meaningful when invoked through PostgREST (browser -> RPC), not from a
-- direct DB connection.
create or replace function public.client_ip()
returns inet
language plpgsql
stable
as $$
declare
  v_hdr text;
  v_ip  text;
begin
  v_hdr := current_setting('request.headers', true);
  if v_hdr is null or v_hdr = '' then
    return null;
  end if;
  v_ip := btrim(split_part(v_hdr::json ->> 'x-forwarded-for', ',', 1));
  if v_ip is null or v_ip = '' then
    return null;
  end if;
  return v_ip::inet;
exception when others then
  return null;
end;
$$;

-- Records a login / registered event for the current authenticated user. Called
-- fire-and-forget from the client. order_created is logged server-side inside
-- place_order (with the real order id), so it's rejected here to stop clients
-- forging purchase events. Login events are deduped within a 10-minute window
-- because Supabase fires SIGNED_IN on token refresh / multi-tab / reload, not
-- just on a fresh sign-in.
create or replace function public.log_activity(p_event_type text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;
  if p_event_type not in ('login', 'registered') then
    return;
  end if;
  if p_event_type = 'login' and exists (
    select 1 from public.customer_activity
    where user_id = v_uid
      and event_type = 'login'
      and created_at > now() - interval '10 minutes'
  ) then
    return;
  end if;

  insert into public.customer_activity (user_id, customer_name, customer_email, event_type, ip)
  select
    v_uid,
    coalesce(nullif(p.full_name, ''), u.raw_user_meta_data ->> 'full_name'),
    u.email,
    p_event_type,
    public.client_ip()
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = v_uid;
end;
$$;

grant execute on function public.log_activity(text) to authenticated;
