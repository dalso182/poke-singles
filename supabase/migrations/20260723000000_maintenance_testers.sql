-- Tester whitelist for maintenance mode: non-admin emails allowed to browse the
-- storefront while app_settings.maintenance_mode is on. Kept OUT of app_settings
-- on purpose — that row is anon-readable (`using (true)`) and the client reads it
-- with select('*'), so a column there would leak the list to every visitor.
-- Admins manage the list from /admin/config; the guard asks via the RPC below.

create table public.maintenance_testers (
  email      text primary key,
  created_at timestamptz not null default now()
);

alter table public.maintenance_testers enable row level security;

-- Admin-only, full access. No anon/select policy at all: the list is invisible
-- to everyone else; testers are answered through the definer RPC.
create policy maintenance_testers_admin_all
  on public.maintenance_testers
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- True when the caller may browse the site despite maintenance mode: admins
-- always, otherwise a whitelist hit on the JWT email (same JWT-read style as
-- is_admin). Definer so the check works without exposing the table.
create or replace function public.maintenance_bypass_allowed()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_admin() or exists (
    select 1
      from public.maintenance_testers t
     where lower(t.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

grant execute on function public.maintenance_bypass_allowed() to authenticated;
