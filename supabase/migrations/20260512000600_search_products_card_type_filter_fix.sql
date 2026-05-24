-- Fix-forward: the previous version of search_products() (migration
-- 20260512000400) used an unprefixed `card_type_ids` parameter which
-- collides with the products_search column of the same name, producing
-- a runtime "column reference is ambiguous" error. Renaming the
-- parameter to `p_card_type_ids` resolves it.
--
-- Logic is otherwise byte-for-byte identical to the previous version.

drop function if exists public.search_products(text, text, int, int, uuid[], uuid[]);

create or replace function public.search_products(
  q                text,
  sort             text default 'relevance',
  limit_n          int  default 60,
  offset_n         int  default 0,
  set_ids          uuid[] default null,
  p_card_type_ids  uuid[] default null
) returns setof public.products_search
language plpgsql stable security invoker as $$
declare
  qpat      text := '%' || coalesce(q, '') || '%';
  qprefix   text := coalesce(q, '') || '%';
  qempty    bool := coalesce(q, '') = '';
  has_sets  bool := set_ids is not null and array_length(set_ids, 1) > 0;
  has_types bool := p_card_type_ids is not null and array_length(p_card_type_ids, 1) > 0;
begin
  if sort = 'price-asc' then
    return query
      select * from public.products_search ps
      where (qempty or ps.search_text ilike qpat)
        and (not has_sets or ps.set_id = any(set_ids))
        and (not has_types or ps.card_type_ids && p_card_type_ids)
      order by ps.price asc, ps.id asc
      limit limit_n offset offset_n;
  elsif sort = 'price-desc' then
    return query
      select * from public.products_search ps
      where (qempty or ps.search_text ilike qpat)
        and (not has_sets or ps.set_id = any(set_ids))
        and (not has_types or ps.card_type_ids && p_card_type_ids)
      order by ps.price desc, ps.id asc
      limit limit_n offset offset_n;
  elsif sort = 'recent' then
    return query
      select * from public.products_search ps
      where (qempty or ps.search_text ilike qpat)
        and (not has_sets or ps.set_id = any(set_ids))
        and (not has_types or ps.card_type_ids && p_card_type_ids)
      order by ps.last_restocked_at desc nulls last, ps.created_at desc, ps.id asc
      limit limit_n offset offset_n;
  else
    return query
      select * from public.products_search ps
      where (qempty or ps.search_text ilike qpat)
        and (not has_sets or ps.set_id = any(set_ids))
        and (not has_types or ps.card_type_ids && p_card_type_ids)
      order by
        case
          when qempty                        then 99
          when ps.name ilike qprefix         then 0
          when ps.pokemon_name ilike qprefix then 1
          when ps.name ilike qpat            then 2
          else 3
        end asc,
        ps.last_restocked_at desc nulls last,
        ps.id asc
      limit limit_n offset offset_n;
  end if;
end;
$$;
