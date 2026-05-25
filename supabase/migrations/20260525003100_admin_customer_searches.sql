-- Customer Searches Report (admin "Reportes" → Búsquedas). The read side of
-- public.search_log: a chronological feed of storefront searches with the match
-- count, who searched (registered or guest), and IP. Admin-only (security
-- definer + is_admin guard) since the table is RLS-locked with no policies and we
-- join auth.users for the registered customer's email.
--
-- Filters mirror the other report RPCs: customer (name/email contains), keyword
-- (contains), IP (prefix via host()), CR-day date range, and a customer_type
-- toggle (all / guest / registered).

create or replace function public.admin_customer_searches(
  p_search        text default '',
  p_keyword       text default '',
  p_date_start    date default null,
  p_date_end      date default null,
  p_ip            text default '',
  p_customer_type text default 'all',  -- 'all' | 'guest' | 'registered'
  p_limit         int  default 50,
  p_offset        int  default 0
)
returns table (
  id             uuid,
  user_id        uuid,
  customer_name  text,
  customer_email text,
  keyword        text,
  found_count    int,
  category_name  text,
  ip             text,
  created_at     timestamptz,
  total_count    bigint
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
    s.id,
    s.user_id,
    s.customer_name,
    u.email::text   as customer_email,
    s.keyword,
    s.found_count,
    c.name          as category_name,
    host(s.ip)      as ip,
    s.created_at,
    count(*) over() as total_count
  from public.search_log s
  left join auth.users u    on u.id = s.user_id
  left join public.categories c on c.id = s.category_id
  where (p_keyword = '' or s.keyword ilike '%' || p_keyword || '%')
    and (p_search = ''
      or s.customer_name ilike '%' || p_search || '%'
      or u.email         ilike '%' || p_search || '%')
    and (p_ip = '' or host(s.ip) ilike p_ip || '%')
    and (p_customer_type = 'all'
      or (p_customer_type = 'guest'      and s.user_id is null)
      or (p_customer_type = 'registered' and s.user_id is not null))
    and (p_date_start is null
         or (s.created_at at time zone 'America/Costa_Rica')::date >= p_date_start)
    and (p_date_end is null
         or (s.created_at at time zone 'America/Costa_Rica')::date <= p_date_end)
  order by s.created_at desc
  limit p_limit offset p_offset;
end;
$$;

grant execute on function
  public.admin_customer_searches(text, text, date, date, text, text, int, int)
  to authenticated;
