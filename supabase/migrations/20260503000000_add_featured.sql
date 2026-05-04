-- Featured flag: admin-curated promotion of specific listings to the home
-- page. NOT NULL with a default so existing rows are never null. Public read
-- keeps its current predicate (active + quantity + price); featured is purely
-- a sort/filter axis on top, not a visibility gate.

alter table public.products
  add column featured boolean not null default false;

-- Partial index so the home page's "featured" query stays cheap regardless of
-- catalog size. Predicate matches `products_public_read` so the planner can
-- use this index for both admin and customer queries.
create index products_featured_idx
  on public.products (last_restocked_at desc nulls last, created_at desc)
  where featured = true and active = true and quantity > 0 and price > 0;
