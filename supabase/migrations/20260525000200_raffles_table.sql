-- Raffles get a dedicated 1:1 table for their schedule + draw result so all
-- raffle-specific data lives together and /rifas can query products ⨝ raffles.
-- Notes stay on products.description (no duplicate field). The draw date moves
-- out of products.raffle_date into raffles.draw_at; raffles now stay visible on
-- /rifas while active (organized into Activas/Completadas tabs) instead of
-- auto-hiding after the date.

create table public.raffles (
  product_id      uuid primary key references public.products(id) on delete cascade,
  draw_at         timestamptz,
  status          text not null default 'scheduled'
                    check (status in ('scheduled', 'drawn', 'void')),
  winner_order_id uuid references public.orders(id) on delete set null,
  winner_name     text,
  winner_email    text,
  winning_entry   int,
  total_entries   int not null default 0,
  drawn_by        uuid references auth.users(id) on delete set null,
  drawn_at        timestamptz,
  notified_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.raffles is
  'Per-raffle schedule + draw result, 1:1 with a products row in the Rifas category. Notes live on products.description. status void = drawn with zero participants.';

create trigger raffles_set_updated_at
  before update on public.raffles
  for each row execute function public.tg_set_updated_at();

alter table public.raffles enable row level security;

-- Admin-only. Customers never read this table directly; the public /rifas
-- listing goes through the rifas_listing view (below), and winner notification
-- is via email (send-raffle-result edge function, service role).
create policy raffles_admin_all on public.raffles
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Backfill the draw date for existing raffle products.
insert into public.raffles (product_id, draw_at)
select id, raffle_date
from public.products
where category_id = public.raffle_category_id()
on conflict (product_id) do nothing;

-- Raffle visibility no longer depends on the date: raffles stay visible while
-- active (price > 0), normal products still require quantity > 0. Rewrite the
-- policy before dropping the column it referenced.
drop policy products_public_read on public.products;

create policy products_public_read on public.products
  for select to anon, authenticated
  using (
    active = true
    and price > 0
    and (
      case
        when category_id = public.raffle_category_id() then true
        else quantity > 0
      end
    )
  );

alter table public.products drop column raffle_date;

-- Public raffle listing: products ⨝ raffles ⨝ sets, exposing only safe columns
-- (no winner_email). Definer view (security_invoker = false) so it can read the
-- admin-only raffles table; it enforces visibility itself (active + price > 0).
create view public.rifas_listing with (security_invoker = false) as
  select
    p.id,
    p.slug,
    p.name,
    p.image_url,
    p.price,
    p.sale_price,
    p.quantity,
    p.description as notes,
    s.name as set_name,
    r.draw_at,
    coalesce(r.status, 'scheduled') as status,
    r.winner_name,
    r.total_entries
  from public.products p
  left join public.raffles r on r.product_id = p.id
  left join public.sets s on s.id = p.set_id
  where p.category_id = public.raffle_category_id()
    and p.active = true
    and p.price > 0
  order by r.draw_at asc nulls last, p.created_at desc;

grant select on public.rifas_listing to anon, authenticated;
