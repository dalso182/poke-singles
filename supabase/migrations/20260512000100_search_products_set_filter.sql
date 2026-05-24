-- Extend search_products() with an optional set_ids array so /buscar can
-- honor the same Set filter that /products uses. Dropping the old
-- 4-arg signature first because the new signature changes the parameter
-- list and a `create or replace` only works when the signature matches.

drop function if exists public.search_products(text, text, int, int);

create or replace function public.search_products(
  q         text,
  sort      text default 'relevance',
  limit_n   int  default 60,
  offset_n  int  default 0,
  set_ids   uuid[] default null
) returns setof public.products_search
language plpgsql stable security invoker as $$
declare
  qpat     text := '%' || coalesce(q, '') || '%';
  qprefix  text := coalesce(q, '') || '%';
  qempty   bool := coalesce(q, '') = '';
  has_sets bool := set_ids is not null and array_length(set_ids, 1) > 0;
begin
  if sort = 'price-asc' then
    return query
      select * from public.products_search
      where (qempty or search_text ilike qpat)
        and (not has_sets or set_id = any(set_ids))
      order by price asc, id asc
      limit limit_n offset offset_n;
  elsif sort = 'price-desc' then
    return query
      select * from public.products_search
      where (qempty or search_text ilike qpat)
        and (not has_sets or set_id = any(set_ids))
      order by price desc, id asc
      limit limit_n offset offset_n;
  elsif sort = 'recent' then
    return query
      select * from public.products_search
      where (qempty or search_text ilike qpat)
        and (not has_sets or set_id = any(set_ids))
      order by last_restocked_at desc nulls last, created_at desc, id asc
      limit limit_n offset offset_n;
  else
    return query
      select * from public.products_search
      where (qempty or search_text ilike qpat)
        and (not has_sets or set_id = any(set_ids))
      order by
        case
          when qempty                     then 99
          when name ilike qprefix         then 0
          when pokemon_name ilike qprefix then 1
          when name ilike qpat            then 2
          else 3
        end asc,
        last_restocked_at desc nulls last,
        id asc
      limit limit_n offset offset_n;
  end if;
end;
$$;
