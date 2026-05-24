-- Manual raffle draw (admin-triggered): pick a random winner weighted by
-- entries (each purchased entry = one chance), excluding cancelled orders.
-- Idempotent. On draw, an after-update trigger notifies participants by email
-- via the send-raffle-result edge function (pg_net), mirroring handle_new_user.

create or replace function public.draw_raffle(p_product_id uuid)
returns public.raffles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_raffle boolean;
  v_row     public.raffles;
  v_oid     uuid;
  v_name    text;
  v_email   text;
  v_winning int;
  v_total   int;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select (category_id = public.raffle_category_id())
    into v_is_raffle
    from public.products where id = p_product_id;
  if v_is_raffle is distinct from true then
    raise exception 'NOT_A_RAFFLE';
  end if;

  -- Ensure a row exists, then lock it. Idempotent: if already drawn/void, return.
  insert into public.raffles (product_id) values (p_product_id)
    on conflict (product_id) do nothing;
  select * into v_row from public.raffles where product_id = p_product_id for update;
  if v_row.status <> 'scheduled' then
    return v_row;
  end if;

  -- Uniform pick over per-entry rows = weighted by quantity. Cancelled orders
  -- returned their entries, so they're excluded.
  with entries as (
    select o.id as order_id, o.customer_name, o.customer_email,
           row_number() over (order by o.created_at, oi.id, g.n) as entry_no,
           count(*) over () as total
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    cross join lateral generate_series(1, oi.quantity) as g(n)
    where oi.product_id = p_product_id and o.status <> 'cancelled'
  )
  select order_id, customer_name, customer_email, entry_no, total
    into v_oid, v_name, v_email, v_winning, v_total
  from entries
  order by random()
  limit 1;

  update public.raffles set
    status          = case when v_oid is null then 'void' else 'drawn' end,
    winner_order_id = v_oid,
    winner_name     = v_name,
    winner_email    = v_email,
    winning_entry   = v_winning,
    total_entries   = coalesce(v_total, 0),
    drawn_by        = auth.uid(),
    drawn_at        = now()
  where product_id = p_product_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.draw_raffle(uuid) to authenticated;

-- Notify participants + admin when a raffle is drawn. Mirrors handle_new_user:
-- reads the function URL + anon key from Vault and fires a best-effort pg_net
-- POST; a notify failure must never roll back the draw.
create or replace function public.notify_raffle_result()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_url  text;
  v_anon text;
begin
  begin
    select decrypted_secret into v_url
      from vault.decrypted_secrets where name = 'raffle_result_url';
    select decrypted_secret into v_anon
      from vault.decrypted_secrets where name = 'supabase_anon_key';
    if v_url is not null and v_anon is not null then
      perform extensions.http_post(
        url := v_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_anon
        ),
        body := jsonb_build_object('product_id', new.product_id)
      );
    end if;
  exception when others then
    -- Notification failure must never block / roll back the draw.
    null;
  end;
  return new;
end;
$$;

create trigger raffles_notify_result
  after update of status on public.raffles
  for each row
  when (new.status in ('drawn', 'void') and old.status = 'scheduled')
  execute function public.notify_raffle_result();
