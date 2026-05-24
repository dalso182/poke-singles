-- Fix the N/M predicate in search_products(): card_number is stored with
-- leading zeros for some older sets (e.g. "065", "034"), but users type
-- the unpadded form (e.g. "65/197"). Without normalization the exact match
-- silently drops rows.
--
-- Strip leading zeros on both sides for the numeric comparison. Non-numeric
-- card IDs (promo codes like "SWSH001") pass through unchanged on the
-- query side and never get touched on the row side because the regex
-- branch only triggers when the query parses as N/M.
--
-- Display path is unaffected: metaLine() in the UI still renders whatever
-- string is stored in card_number, so "065/197" stays "065/197" in the
-- card meta line. Only the search predicate is normalized.

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
  qtrim     text := btrim(coalesce(q, ''));
  qpat      text := '%' || btrim(coalesce(q, '')) || '%';
  qprefix   text := btrim(coalesce(q, '')) || '%';
  qempty    bool := btrim(coalesce(q, '')) = '';
  has_sets  bool := set_ids is not null and array_length(set_ids, 1) > 0;
  has_types bool := p_card_type_ids is not null and array_length(p_card_type_ids, 1) > 0;
  m         text[];
  q_num     text;
  q_total   int;
  is_nm     bool := false;
begin
  m := regexp_match(qtrim, '^(\S+)\s*/\s*(\d+)$');
  if m is not null then
    if m[1] ~ '^\d+$' then
      q_num := regexp_replace(m[1], '^0+(?=\d)', '');
    else
      q_num := m[1];
    end if;
    q_total := m[2]::int;
    is_nm   := true;
  end if;

  if sort = 'price-asc' then
    return query
      select * from public.products_search ps
      where (
        case
          when is_nm then
            regexp_replace(coalesce(ps.card_number, ''), '^0+(?=\d)', '') = q_num
            and ps.set_printed_total = q_total
          else qempty or ps.search_text ilike qpat
        end
      )
        and (not has_sets or ps.set_id = any(set_ids))
        and (not has_types or ps.card_type_ids && p_card_type_ids)
      order by ps.price asc, ps.id asc
      limit limit_n offset offset_n;
  elsif sort = 'price-desc' then
    return query
      select * from public.products_search ps
      where (
        case
          when is_nm then
            regexp_replace(coalesce(ps.card_number, ''), '^0+(?=\d)', '') = q_num
            and ps.set_printed_total = q_total
          else qempty or ps.search_text ilike qpat
        end
      )
        and (not has_sets or ps.set_id = any(set_ids))
        and (not has_types or ps.card_type_ids && p_card_type_ids)
      order by ps.price desc, ps.id asc
      limit limit_n offset offset_n;
  elsif sort = 'recent' then
    return query
      select * from public.products_search ps
      where (
        case
          when is_nm then
            regexp_replace(coalesce(ps.card_number, ''), '^0+(?=\d)', '') = q_num
            and ps.set_printed_total = q_total
          else qempty or ps.search_text ilike qpat
        end
      )
        and (not has_sets or ps.set_id = any(set_ids))
        and (not has_types or ps.card_type_ids && p_card_type_ids)
      order by ps.last_restocked_at desc nulls last, ps.created_at desc, ps.id asc
      limit limit_n offset offset_n;
  else
    return query
      select * from public.products_search ps
      where (
        case
          when is_nm then
            regexp_replace(coalesce(ps.card_number, ''), '^0+(?=\d)', '') = q_num
            and ps.set_printed_total = q_total
          else qempty or ps.search_text ilike qpat
        end
      )
        and (not has_sets or ps.set_id = any(set_ids))
        and (not has_types or ps.card_type_ids && p_card_type_ids)
      order by
        case
          when is_nm or qempty               then 99
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
