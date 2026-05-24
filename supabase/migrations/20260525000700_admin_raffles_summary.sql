-- Admin raffle list data: one row per Rifas-category product (incl. inactive)
-- with its draw status + entry counts. Admin-only (security definer + is_admin
-- guard) since it aggregates buyer/order data.

create or replace function public.admin_raffles_summary()
returns table (
  product_id      uuid,
  name            text,
  image_url       text,
  slug            text,
  price           numeric,
  quantity        integer,
  active          boolean,
  draw_at         timestamptz,
  status          text,
  winner_name     text,
  drawn_at        timestamptz,
  entries_sold    bigint,
  entries_pending bigint,
  participants    bigint
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
    r.draw_at,
    coalesce(r.status, 'scheduled') as status,
    r.winner_name,
    r.drawn_at,
    coalesce(agg.sold, 0)::bigint        as entries_sold,
    coalesce(agg.pending, 0)::bigint     as entries_pending,
    coalesce(agg.participants, 0)::bigint as participants
  from public.products p
  left join public.raffles r on r.product_id = p.id
  left join lateral (
    select
      sum(oi.quantity) filter (where o.status <> 'cancelled')              as sold,
      sum(oi.quantity) filter (where o.status = 'pending')                 as pending,
      count(distinct lower(o.customer_email)) filter (where o.status <> 'cancelled') as participants
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.product_id = p.id
  ) agg on true
  where p.category_id = public.raffle_category_id()
  order by (coalesce(r.status, 'scheduled') = 'scheduled') desc,
           r.draw_at asc nulls last,
           p.created_at desc;
end;
$$;

grant execute on function public.admin_raffles_summary() to authenticated;
