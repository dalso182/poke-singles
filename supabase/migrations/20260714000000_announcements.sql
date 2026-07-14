-- Admin-authored announcement modals. At most one is active at a time; every
-- visitor sees the active one exactly once (localStorage flag for guests, an
-- announcement_reads row for signed-in users — the app syncs guest→DB on
-- login). Re-activating an old announcement does NOT re-show it: reads are
-- keyed by announcement id and never expire. Admin CRUD at /admin/announcements.
-- Absorbs the old first-visit welcome modal (bienvenida static page).

create table public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body_html   text not null default '',
  image_url   text,          -- root-relative /card-images/... from the image picker
  link_path   text,          -- optional internal route, e.g. /rifas
  link_label  text,          -- button copy for the link
  is_active   boolean not null default false,
  view_count  integer not null default 0,  -- modal impressions, guests included
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Hard guarantee: never more than one live active announcement. Activation is
-- two client queries (deactivate all, then activate one); a race between them
-- errors here instead of ever leaving two active.
create unique index announcements_single_active_idx
  on public.announcements (is_active)
  where is_active and deleted_at is null;

create trigger announcements_set_updated_at
  before update on public.announcements
  for each row execute function public.tg_set_updated_at();

alter table public.announcements enable row level security;

create policy announcements_public_read_active on public.announcements
  for select to anon, authenticated
  using (is_active = true and deleted_at is null);

create policy announcements_admin_all on public.announcements
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Per-user "seen" flags. Row present = never show that announcement again.
create table public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  seen_at         timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

alter table public.announcement_reads enable row level security;

-- Mirrors cart_items self-ownership; `for all` covers the upsert's
-- select + insert + update in one policy.
create policy announcement_reads_self on public.announcement_reads
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy announcement_reads_admin_read on public.announcement_reads
  for select to authenticated
  using (public.is_admin());

-- View counter: anon-callable, but only bumps the live active row so a guest
-- can't inflate arbitrary ids. The storefront fires it when the modal opens.
create or replace function public.increment_announcement_views(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.announcements
     set view_count = view_count + 1
   where id = p_id and is_active = true and deleted_at is null;
$$;

grant execute on function public.increment_announcement_views(uuid) to anon, authenticated;

-- Absorb the old welcome modal: copy the bienvenida static page into an
-- INACTIVE announcement (review + activate from /admin/announcements) and
-- soft-delete the page so it stops rendering at /info/bienvenida.
insert into public.announcements (title, body_html)
select title, content from public.static_pages
 where slug = 'bienvenida' and deleted_at is null and content <> '';

update public.static_pages set deleted_at = now()
 where slug = 'bienvenida' and deleted_at is null;
