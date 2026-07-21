-- Auction auto-close: the per-minute worker (process_auctions), the winner
-- order creator, and the winner-notification trigger.
--
-- Flow: pg_cron (next migration) calls process_auctions() every minute. It
-- (a) stamps + dispatches the "30 minutes left" reminder email for auctions
-- entering the final stretch, and (b) closes auctions whose ends_at passed:
-- picks the top eligible bid, creates a NORMAL order for the winner at their
-- bid amount (the standard payment-proof + /admin/orders flow takes over),
-- and flips status → 'ended' (or 'void' with no eligible bids). The status
-- flip's single UPDATE fires both the broadcast trigger (live viewers see
-- Finalizada) and the notify trigger below (winner email via net.http_post →
-- send-auction-result), mirroring the raffles notify pattern.

-- Create the winner's order from the top eligible bid. Internal helper —
-- execute revoked below; called by process_auctions (close) and, later, by
-- the admin reassign flow with p_exclude_user = the defaulting winner.
-- Eligible = live bid (not invalidated), account still exists, not
-- auction-banned, and not the excluded user. Returns
-- {order_id, bid_id, user_id, winner_name, winner_email} or NULL when no
-- eligible bid remains (caller voids the auction).
create or replace function public.auction_create_winner_order(
  p_product_id uuid,
  p_exclude_user uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bid      public.bids%rowtype;
  v_product  public.products%rowtype;
  v_set_name text;
  v_seller_code text;
  v_seller_name text;
  v_phone    text;
  v_address  jsonb;
  v_order_id uuid;
begin
  select b.* into v_bid
  from public.bids b
  where b.product_id = p_product_id
    and b.invalidated_at is null
    and b.user_id is not null
    and (p_exclude_user is null or b.user_id is distinct from p_exclude_user)
    and not exists (
      select 1 from public.profiles pr
      where pr.id = b.user_id and pr.auction_banned_at is not null
    )
  order by b.amount desc, b.created_at asc
  limit 1;
  if not found then
    return null;
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
  for update;
  if not found then
    return null;
  end if;

  if v_product.set_id is not null then
    select name into v_set_name from public.sets where id = v_product.set_id;
  end if;
  v_seller_code := null;
  v_seller_name := null;
  if v_product.seller_id is not null then
    select code, name into v_seller_code, v_seller_name
    from public.sellers where id = v_product.seller_id;
  end if;

  select pr.phone, pr.default_shipping_address
  into v_phone, v_address
  from public.profiles pr
  where pr.id = v_bid.user_id;

  -- Shipping is coordinated after the win (no method picked at bid time), so
  -- the order carries a null method + zero shipping; admin adjusts if needed.
  insert into public.orders (
    user_id, customer_email, customer_name, customer_phone,
    shipping_address, shipping_method_id, shipping_method_name, shipping_amount,
    payment_method, subtotal, discount_amount, total, customer_notes
  ) values (
    v_bid.user_id, lower(v_bid.bidder_email), v_bid.bidder_name, coalesce(v_phone, ''),
    v_address, null, 'Por coordinar', 0,
    'sinpe_or_transfer', v_bid.amount, 0, v_bid.amount,
    'Orden generada automáticamente por subasta ganada.'
  ) returning id into v_order_id;

  insert into public.order_items (
    order_id, product_id, product_slug, product_name,
    product_image_url, product_condition,
    product_set_name, product_card_number,
    seller_id, seller_code, seller_name,
    unit_price, quantity, line_total
  ) values (
    v_order_id, v_product.id, v_product.slug, v_product.name,
    v_product.image_url, v_product.condition,
    v_set_name, v_product.card_number,
    v_product.seller_id, v_seller_code, v_seller_name,
    v_bid.amount, 1, v_bid.amount
  );

  update public.products
  set quantity = quantity - 1
  where id = v_product.id and quantity > 0;

  -- Activity log (client_ip() is null in cron context — fine, column is nullable).
  insert into public.customer_activity (
    user_id, customer_name, customer_email, event_type, order_id, ip
  ) values (
    v_bid.user_id, v_bid.bidder_name, lower(v_bid.bidder_email),
    'order_created', v_order_id, public.client_ip()
  );

  return jsonb_build_object(
    'order_id', v_order_id,
    'bid_id', v_bid.id,
    'user_id', v_bid.user_id,
    'winner_name', v_bid.bidder_name,
    'winner_email', lower(v_bid.bidder_email)
  );
end;
$$;

revoke execute on function public.auction_create_winner_order(uuid, uuid)
  from public, anon, authenticated;

-- The per-minute worker. Reminder scan first (stamp-first so a send failure
-- can never double-email), then the close scan. Each auction closes inside
-- its own exception guard so one bad row can't wedge the queue.
create or replace function public.process_auctions()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rec    record;
  v_url    text;
  v_anon   text;
  v_result jsonb;
begin
  -- 1. Reminders: auctions with bids entering their final 30 minutes.
  --    The UPDATE ... RETURNING stamps reminder_sent_at atomically, so even
  --    if the http dispatch fails the reminder is considered spent (no
  --    retry-spam; accepted trade-off, mirroring notified_at semantics).
  for v_rec in
    update public.auctions a
    set reminder_sent_at = now()
    where a.status = 'active'
      and a.reminder_sent_at is null
      and a.bid_count > 0
      and a.ends_at is not null
      and a.ends_at between now() and now() + interval '30 minutes'
    returning a.product_id
  loop
    begin
      select decrypted_secret into v_url
        from vault.decrypted_secrets where name = 'auction_reminder_url';
      select decrypted_secret into v_anon
        from vault.decrypted_secrets where name = 'supabase_anon_key';
      if v_url is not null and v_anon is not null then
        perform net.http_post(
          url := v_url,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_anon
          ),
          body := jsonb_build_object('product_id', v_rec.product_id)
        );
      end if;
    exception when others then
      null;  -- reminder dispatch is best-effort
    end;
  end loop;

  -- 2. Close ended auctions. SKIP LOCKED serializes against place_bid's row
  --    lock and any overlapping cron run: a row being bid on right now is
  --    picked up by the next tick.
  for v_rec in
    select a.product_id
    from public.auctions a
    where a.status = 'active'
      and a.ends_at is not null
      and a.ends_at <= now()
    for update skip locked
  loop
    begin
      v_result := public.auction_create_winner_order(v_rec.product_id);
      if v_result is null then
        update public.auctions
        set status = 'void', closed_at = now()
        where product_id = v_rec.product_id;
      else
        -- Single UPDATE: one broadcast + the notify trigger below fires on
        -- the winner_order_id transition.
        update public.auctions
        set status          = 'ended',
            closed_at       = now(),
            winner_user_id  = (v_result ->> 'user_id')::uuid,
            winner_bid_id   = (v_result ->> 'bid_id')::uuid,
            winner_order_id = (v_result ->> 'order_id')::uuid,
            winner_name     = v_result ->> 'winner_name',
            winner_email    = v_result ->> 'winner_email'
        where product_id = v_rec.product_id;
      end if;
    exception when others then
      -- One broken auction must not block the rest; retried next tick.
      null;
    end;
  end loop;
end;
$$;

revoke execute on function public.process_auctions()
  from public, anon, authenticated;

-- Winner email: fires whenever winner_order_id lands on a NEW order — the
-- initial close AND a later admin reassignment. Mirrors notify_raffle_result
-- (net.http_post + Vault secrets, all failures swallowed).
create or replace function public.notify_auction_result()
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
      from vault.decrypted_secrets where name = 'auction_result_url';
    select decrypted_secret into v_anon
      from vault.decrypted_secrets where name = 'supabase_anon_key';
    if v_url is not null and v_anon is not null then
      perform net.http_post(
        url := v_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_anon
        ),
        body := jsonb_build_object('product_id', new.product_id)
      );
    end if;
  exception when others then
    -- Notification failure must never block / roll back the close.
    null;
  end;
  return new;
end;
$$;

create trigger auctions_notify_result
  after update of winner_order_id on public.auctions
  for each row
  when (new.winner_order_id is not null
        and new.winner_order_id is distinct from old.winner_order_id)
  execute function public.notify_auction_result();
