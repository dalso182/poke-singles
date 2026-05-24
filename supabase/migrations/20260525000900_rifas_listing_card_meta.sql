-- Add card_number + set printed_total to the public raffle listing so the
-- /rifas card can show the card identity meta line (set name + #number/total),
-- matching the product card. Appended at the end (CREATE OR REPLACE VIEW only
-- allows adding columns last).

create or replace view public.rifas_listing with (security_invoker = false) as
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
    r.total_entries,
    coalesce(agg.sold, 0)::int as entries_sold,
    p.card_number,
    s.printed_total as set_printed_total
  from public.products p
  left join public.raffles r on r.product_id = p.id
  left join public.sets s on s.id = p.set_id
  left join lateral (
    select sum(oi.quantity) as sold
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.product_id = p.id and o.status <> 'cancelled'
  ) agg on true
  where p.category_id = public.raffle_category_id()
    and p.active = true
    and p.price > 0
  order by r.draw_at asc nulls last, p.created_at desc;

grant select on public.rifas_listing to anon, authenticated;
