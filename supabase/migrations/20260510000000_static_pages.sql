-- Admin-managed static / informational pages (About Us, FAQ, shipping policy,
-- etc.). Replaces the OpenCart "information/information" pages. Public route
-- /info/:slug fetches by slug; admin CRUD lives at /admin/pages.

create table public.static_pages (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  title             text not null,
  content           text not null default '',
  meta_description  text,
  is_published      boolean not null default true,
  sort_order        integer not null default 0,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index static_pages_published_idx
  on public.static_pages (sort_order, slug)
  where deleted_at is null and is_published = true;

create trigger static_pages_set_updated_at
  before update on public.static_pages
  for each row execute function public.tg_set_updated_at();

alter table public.static_pages enable row level security;

create policy static_pages_public_read on public.static_pages
  for select to anon, authenticated
  using (is_published = true and deleted_at is null);

create policy static_pages_admin_all on public.static_pages
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Seed the About Us row so admins can edit it from /admin/pages
-- immediately. Empty content; admin pastes the OpenCart HTML in.
insert into public.static_pages (slug, title, content, sort_order)
values ('sobre-nosotros', 'Sobre nosotros', '', 10)
on conflict (slug) do nothing;
