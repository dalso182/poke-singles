-- Customer Activity Report (admin "Reportes" → Actividad de clientes). The read
-- side of public.customer_activity: a chronological feed of customer events with
-- IP and timestamp, filterable by customer (name/email), date range, and IP
-- prefix. Admin-only (security definer + is_admin guard) since the table is
-- RLS-locked with no policies.
--
-- ip is returned as text via host() (drops any /32 mask) so the client gets a
-- plain address string. p_ip matches as a prefix so "190.171" narrows to a
-- subnet. Dates use CR-day boundaries to match the rest of the admin.

create or replace function public.admin_customer_activity(
  p_search     text default '',
  p_date_start date default null,
  p_date_end   date default null,
  p_ip         text default '',
  p_limit      int  default 50,
  p_offset     int  default 0
)
returns table (
  id             uuid,
  user_id        uuid,
  customer_name  text,
  customer_email text,
  event_type     text,
  order_id       uuid,
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
    a.id,
    a.user_id,
    a.customer_name,
    a.customer_email,
    a.event_type,
    a.order_id,
    host(a.ip)      as ip,
    a.created_at,
    count(*) over() as total_count
  from public.customer_activity a
  where (p_search = ''
     or a.customer_name  ilike '%' || p_search || '%'
     or a.customer_email ilike '%' || p_search || '%')
    and (p_ip = '' or host(a.ip) ilike p_ip || '%')
    and (p_date_start is null
         or (a.created_at at time zone 'America/Costa_Rica')::date >= p_date_start)
    and (p_date_end is null
         or (a.created_at at time zone 'America/Costa_Rica')::date <= p_date_end)
  order by a.created_at desc
  limit p_limit offset p_offset;
end;
$$;

grant execute on function public.admin_customer_activity(text, date, date, text, int, int)
  to authenticated;
