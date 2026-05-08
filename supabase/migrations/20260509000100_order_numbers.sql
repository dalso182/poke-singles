-- Human-friendly sequential order numbers, separate from the UUID id.
-- Production picks up at #7300 (continuing the legacy OpenCart numbering);
-- existing dev test rows get backfilled to 1..N so the gap visually marks
-- where production data begins.

create sequence orders_number_seq start with 7300;

alter table public.orders add column order_number integer;

-- Backfill existing rows in chronological order. Sequence stays at 7300
-- for the first new order placed after this migration.
update public.orders o
set order_number = sub.n
from (
  select id, row_number() over (order by created_at) as n
  from public.orders
) sub
where o.id = sub.id;

alter table public.orders
  alter column order_number set not null,
  alter column order_number set default nextval('orders_number_seq');

create unique index orders_number_unique on public.orders (order_number);

-- Drop the sequence if the column / table is dropped.
alter sequence orders_number_seq owned by public.orders.order_number;
