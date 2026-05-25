-- Customer search log — the data behind the admin "Reportes" → Búsquedas report
-- (port of OpenCart's Customer Searches Report). One row per committed storefront
-- search: the keyword, how many products it matched, who searched (registered or
-- guest), the client IP, and a timestamp.
--
-- Same lockdown as customer_activity: RLS enabled with NO policies. Writes go
-- only through log_search (security definer); reads only through the admin report
-- RPC. The count is computed separately in the *caller's* RLS context so it
-- reflects what the shopper actually saw (visible, in-stock products).

create table public.search_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users (id) on delete set null,
  -- Name snapshot so the log reads right if the account is renamed/deleted;
  -- null = guest (anonymous) search.
  customer_name text,
  keyword       text not null,
  found_count   int  not null default 0,
  -- Reserved: storefront search isn't category-scoped today, so this is null for
  -- now. Stored so a category-scoped search can populate it later without a
  -- schema change.
  category_id   uuid references public.categories (id) on delete set null,
  ip            inet,
  created_at    timestamptz not null default now()
);

create index search_log_created_idx on public.search_log (created_at desc);

alter table public.search_log enable row level security;
-- (intentionally no policies — see header)

-- Count of products a keyword matches, in the CALLER's RLS context so it counts
-- only what the storefront shows (active + in-stock, via products_search's
-- security_invoker). A lean aggregate (no ordering / no row materialization) so
-- it stays cheap as the catalog grows. Uses the same base search_text predicate
-- as search_products; the rare "number/total" (e.g. 15/151) branch isn't
-- special-cased here — close enough for an analytics metric.
create or replace function public.count_search_products(
  q               text,
  p_category_slug text default null
)
returns int
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select count(*)::int
  from public.products_search ps
  where (btrim(coalesce(q, '')) = '' or ps.search_text ilike '%' || btrim(q) || '%')
    and (p_category_slug is null
         or ps.category_id = public.category_id_by_slug(p_category_slug));
$$;

grant execute on function public.count_search_products(text, text) to anon, authenticated;

-- Records one committed storefront search. Called fire-and-forget from the search
-- box. Trusts the client-supplied p_found (already computed in the caller's RLS
-- context via count_search_products) — analytics, not security-sensitive, and the
-- definer keeps writes funneled through here instead of granting anon table
-- INSERT. Guests (auth.uid() null) are logged too, hence anon execute.
create or replace function public.log_search(
  p_term          text,
  p_found         int  default 0,
  p_category_slug text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_term text := btrim(coalesce(p_term, ''));
begin
  if v_term = '' then
    return;
  end if;

  insert into public.search_log (user_id, customer_name, keyword, found_count, category_id, ip)
  select
    v_uid,
    case
      when v_uid is null then null
      else coalesce(nullif(p.full_name, ''), u.raw_user_meta_data ->> 'full_name')
    end,
    v_term,
    greatest(coalesce(p_found, 0), 0),
    case when p_category_slug is null then null
         else public.category_id_by_slug(p_category_slug) end,
    public.client_ip()
  from (select 1) seed
  left join auth.users u    on u.id = v_uid
  left join public.profiles p on p.id = v_uid;
end;
$$;

grant execute on function public.log_search(text, int, text) to anon, authenticated;
