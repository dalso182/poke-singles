-- Customer profile data. Keyed 1:1 to auth.users so cart_items, orders, and
-- shipping addresses (later) can FK to a stable id we own. Auto-created on
-- signup via the on_auth_user_created trigger so application code never has
-- to "ensure profile exists" before reading it.

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  default_shipping_address jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can read/update only their own row.
create policy profiles_self_read on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_self_insert on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Admins can read/update any profile (support, order management later).
create policy profiles_admin_all on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- updated_at maintained by the existing trigger function from the initial
-- catalog migration.
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.tg_set_updated_at();

-- Auto-create a profile row on every new auth.users insert. Captures
-- full_name from raw_user_meta_data:
--   * Google fills it as `full_name` (and also `name`)
--   * Email signup via signUpWithPassword sends `full_name`
--   * Magic link leaves it null until the user edits /account
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: existing auth.users (the admin Google account) need profile rows
-- so the trigger doesn't create a "first user has no profile" gap. Pulls
-- full_name from the same metadata fields the trigger uses.
insert into public.profiles (id, full_name)
select
  u.id,
  coalesce(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name'
  )
from auth.users u
on conflict (id) do nothing;
