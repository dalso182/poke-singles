-- Auction lifecycle tables + public read views.
--
-- `auctions` is 1:1 with a products row in the Subastas category (mirror of
-- `raffles`, 20260525000200): admin-editable config (ends_at, min_increment,
-- anti_snipe_minutes) plus denormalized live state (current_bid, bid_count,
-- leader) maintained exclusively by place_bid, and the close result (winner_*,
-- closed_at) written by process_auctions / reassign_auction_winner.
--
-- `bids` is append-only. Bidder name/email are snapshotted at bid time so the
-- audit trail survives profile edits and account deletion. Relisting an
-- auction never deletes bids — it stamps invalidated_at, and every live read
-- filters `invalidated_at is null`.
--
-- Both tables are admin-only under RLS. Customers read through the two
-- definer views below (subastas_listing / subastas_bids), which expose only
-- safe columns with bidder names masked. Bids are written only via the
-- place_bid RPC (security definer, next phase).

create table public.auctions (
  product_id         uuid primary key references public.products(id) on delete cascade,
  ends_at            timestamptz,
  min_increment      numeric(12,2) not null default 1000 check (min_increment > 0),
  anti_snipe_minutes int not null default 5 check (anti_snipe_minutes between 0 and 60),
  status             text not null default 'active'
                       check (status in ('active', 'ended', 'void')),
  current_bid        numeric(12,2),
  bid_count          int not null default 0,
  leader_user_id     uuid references auth.users(id) on delete set null,
  winner_user_id     uuid references auth.users(id) on delete set null,
  winner_bid_id      uuid,
  winner_order_id    uuid references public.orders(id) on delete set null,
  winner_name        text,
  winner_email       text,
  reminder_sent_at   timestamptz,
  notified_at        timestamptz,
  closed_at          timestamptz,
  relist_count       int not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.auctions is
  'Per-auction config + live state + close result, 1:1 with a products row in the Subastas category. ends_at NULL = not scheduled yet. status void = closed with zero bids (or reassigned with no eligible bidder). Notes live on products.description.';
comment on column public.auctions.anti_snipe_minutes is
  'A bid arriving with less than this many minutes left pushes ends_at to now() + this window. 0 disables anti-sniping.';
comment on column public.auctions.reminder_sent_at is
  'Stamped by process_auctions when the 30-minutes-left reminder email is dispatched; guards once-only sending.';

create trigger auctions_set_updated_at
  before update on public.auctions
  for each row execute function public.tg_set_updated_at();

alter table public.auctions enable row level security;

create policy auctions_admin_all on public.auctions
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create table public.bids (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.auctions(product_id) on delete cascade,
  user_id        uuid references auth.users(id) on delete set null,
  bidder_name    text not null,
  bidder_email   text not null,
  amount         numeric(12,2) not null check (amount > 0),
  invalidated_at timestamptz,
  created_at     timestamptz not null default now()
);

comment on table public.bids is
  'Append-only bid log. Inserted only by place_bid. invalidated_at is stamped by relist_auction — invalidated bids are hidden from all live reads but kept for audit.';

-- Top-bid lookups (close, reassign, min-next) and history reads.
create index bids_product_top on public.bids (product_id, amount desc, created_at asc)
  where invalidated_at is null;
create index bids_product_created on public.bids (product_id, created_at desc);
create index bids_user on public.bids (user_id);

alter table public.bids enable row level security;

create policy bids_admin_all on public.bids
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- FK deferred to here because bids references auctions and vice versa.
alter table public.auctions
  add constraint auctions_winner_bid_fk
  foreign key (winner_bid_id) references public.bids(id) on delete set null;

-- 'Diego Alvarez' -> 'D***o A.' ; 'Diego' -> 'D***o' ; 'Al' -> 'A***' ;
-- null/blank -> 'Anónimo'. Used by the public views so bidders can recognize
-- themselves without exposing identities; admin screens read the raw name.
create or replace function public.mask_bidder_name(p_name text)
returns text
language sql
immutable
as $$
  select case
    when p_name is null or btrim(p_name) = '' then 'Anónimo'
    else (
      select
        case
          when length(w[1]) > 2 then left(w[1], 1) || '***' || right(w[1], 1)
          else left(w[1], 1) || '***'
        end
        || case
             when array_length(w, 1) > 1 and length(w[2]) > 0
               then ' ' || left(w[2], 1) || '.'
             else ''
           end
      from (select regexp_split_to_array(btrim(p_name), '\s+') as w) parts
    )
  end;
$$;

grant execute on function public.mask_bidder_name(text) to anon, authenticated;

-- Public auction listing: products ⨝ auctions ⨝ sets, safe columns only (no
-- winner_email, no user ids). Definer view (security_invoker = false) so it
-- can read the admin-only auctions table; it enforces visibility itself —
-- mirror of rifas_listing, plus the deleted_at guard that postdates it.
create view public.subastas_listing with (security_invoker = false) as
  select
    p.id,
    p.slug,
    p.name,
    p.image_url,
    p.price as starting_price,
    p.quantity,
    p.description as notes,
    p.condition,
    p.card_number,
    s.name as set_name,
    s.printed_total as set_printed_total,
    a.ends_at,
    coalesce(a.status, 'active') as status,
    a.min_increment,
    a.anti_snipe_minutes,
    a.current_bid,
    coalesce(a.bid_count, 0) as bid_count,
    public.mask_bidder_name(a.winner_name) as winner_masked,
    a.closed_at
  from public.products p
  left join public.auctions a on a.product_id = p.id
  left join public.sets s on s.id = p.set_id
  where p.category_id = public.auction_category_id()
    and p.active = true
    and p.deleted_at is null
    and p.price > 0
  order by (coalesce(a.status, 'active') = 'active') desc,
           a.ends_at asc nulls last,
           p.created_at desc;

grant select on public.subastas_listing to anon, authenticated;

-- Public bid history: masked names + Pokémon avatar; is_mine lets a signed-in
-- bidder spot their own bids. Definer view over the admin-only bids table —
-- auth.uid() still resolves to the caller inside a definer view.
create view public.subastas_bids with (security_invoker = false) as
  select
    b.id,
    b.product_id,
    b.amount,
    b.created_at,
    public.mask_bidder_name(b.bidder_name) as bidder_masked,
    pr.avatar_pokemon_number,
    (b.user_id is not distinct from auth.uid()) as is_mine
  from public.bids b
  left join public.profiles pr on pr.id = b.user_id
  where b.invalidated_at is null
  order by b.created_at desc;

grant select on public.subastas_bids to anon, authenticated;

-- Admin auction list data: one row per Subastas-category product (incl.
-- inactive), with live state + winner. Mirror of admin_raffles_summary.
create or replace function public.admin_auctions_summary()
returns table (
  product_id       uuid,
  name             text,
  image_url        text,
  slug             text,
  starting_price   numeric,
  quantity         integer,
  active           boolean,
  ends_at          timestamptz,
  status           text,
  min_increment    numeric,
  current_bid      numeric,
  bid_count        integer,
  bidders          bigint,
  winner_name      text,
  winner_order_id  uuid,
  winner_order_number integer,
  reminder_sent_at timestamptz,
  closed_at        timestamptz,
  relist_count     integer
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
    p.id, p.name, p.image_url, p.slug, p.price, p.quantity, p.active,
    a.ends_at,
    coalesce(a.status, 'active') as status,
    a.min_increment,
    a.current_bid,
    coalesce(a.bid_count, 0) as bid_count,
    coalesce(agg.bidders, 0)::bigint as bidders,
    a.winner_name,
    a.winner_order_id,
    o.order_number as winner_order_number,
    a.reminder_sent_at,
    a.closed_at,
    coalesce(a.relist_count, 0) as relist_count
  from public.products p
  left join public.auctions a on a.product_id = p.id
  left join public.orders o on o.id = a.winner_order_id
  left join lateral (
    select count(distinct b.user_id) as bidders
    from public.bids b
    where b.product_id = p.id and b.invalidated_at is null
  ) agg on true
  where p.category_id = public.auction_category_id()
  order by (coalesce(a.status, 'active') = 'active') desc,
           a.ends_at asc nulls last,
           p.created_at desc;
end;
$$;

grant execute on function public.admin_auctions_summary() to authenticated;
