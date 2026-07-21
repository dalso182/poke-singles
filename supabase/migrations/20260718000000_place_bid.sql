-- Bidding: the place_bid RPC + the live-update broadcast trigger.
--
-- place_bid is the ONLY write path into `bids` (the table is admin-RLS'd; the
-- RPC is security definer). It serializes concurrent bids on the same auction
-- with a FOR UPDATE row lock on `auctions` — the same lock process_auctions
-- takes when closing — so a bid and the close can never interleave.
--
-- Live updates ride Supabase Broadcast: any change to the auctions row's live
-- columns fires realtime.send() on the public topic 'auction:<product_id>'
-- with an already-masked payload, so /subastas/:slug viewers (anon included)
-- see new bids / anti-snipe extensions / the close without polling. The
-- channel is public, so clients treat payloads as hints and re-fetch the
-- definer views for authoritative state.

-- Broadcast the auction's live state. Fires on bids (current_bid/bid_count),
-- anti-snipe extensions (ends_at), closes and relists (status). Best-effort:
-- a realtime failure must never roll back the bid/close transaction.
create or replace function public.tg_auction_broadcast()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object(
        'product_id', new.product_id,
        'status', new.status,
        'current_bid', new.current_bid,
        'bid_count', new.bid_count,
        'ends_at', new.ends_at,
        'top_bidder', (
          select public.mask_bidder_name(b.bidder_name)
          from public.bids b
          where b.product_id = new.product_id and b.invalidated_at is null
          order by b.amount desc, b.created_at asc
          limit 1
        ),
        'top_avatar', (
          select pr.avatar_pokemon_number
          from public.bids b
          join public.profiles pr on pr.id = b.user_id
          where b.product_id = new.product_id and b.invalidated_at is null
          order by b.amount desc, b.created_at asc
          limit 1
        )
      ),
      'auction_update',                 -- event
      'auction:' || new.product_id,     -- topic
      false                             -- public channel (payload is masked)
    );
  exception when others then
    null;
  end;
  return new;
end;
$$;

create trigger auctions_broadcast
  after update of current_bid, bid_count, ends_at, status on public.auctions
  for each row execute function public.tg_auction_broadcast();

-- Place a bid. Returns a jsonb envelope like place_order: {ok:true, ...} or
-- {ok:false, error:CODE, ...context}. Only the no-session case raises.
create or replace function public.place_bid(p_product_id uuid, p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_auction   public.auctions%rowtype;
  v_product   public.products%rowtype;
  v_min       numeric(12,2);
  v_new_ends  timestamptz;
  v_name      text;
  v_email     text;
  v_bid_id    uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHORIZED';
  end if;

  -- Whole colones only, within sane bounds.
  if p_amount is null or p_amount <= 0
     or p_amount <> round(p_amount)
     or p_amount > 99999999 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_AMOUNT');
  end if;

  -- Serialize concurrent bids (and the cron close) on this auction.
  select * into v_auction
  from public.auctions
  where product_id = p_product_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_AN_AUCTION');
  end if;

  select * into v_product from public.products where id = p_product_id;
  if not found or not v_product.active or v_product.deleted_at is not null
     or v_auction.status <> 'active' or v_auction.ends_at is null then
    return jsonb_build_object('ok', false, 'error', 'AUCTION_NOT_ACTIVE');
  end if;

  if now() >= v_auction.ends_at then
    return jsonb_build_object('ok', false, 'error', 'AUCTION_ENDED');
  end if;

  if exists (
    select 1 from public.profiles
    where id = v_uid and auction_banned_at is not null
  ) then
    return jsonb_build_object('ok', false, 'error', 'AUCTION_BANNED');
  end if;

  -- The current leader has nothing to gain by outbidding themselves.
  if v_auction.leader_user_id = v_uid then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_LEADING');
  end if;

  v_min := case
    when v_auction.current_bid is null then v_product.price
    else v_auction.current_bid + v_auction.min_increment
  end;
  if p_amount < v_min then
    return jsonb_build_object(
      'ok', false, 'error', 'BID_TOO_LOW',
      'min_next', v_min,
      'current_bid', v_auction.current_bid,
      'bid_count', v_auction.bid_count
    );
  end if;

  -- Anti-sniping: a bid inside the final window pushes the close out to a
  -- full window from now, giving everyone a fair chance to respond.
  v_new_ends := v_auction.ends_at;
  if v_auction.anti_snipe_minutes > 0
     and v_auction.ends_at - now() < make_interval(mins => v_auction.anti_snipe_minutes) then
    v_new_ends := now() + make_interval(mins => v_auction.anti_snipe_minutes);
  end if;

  -- Snapshot the bidder identity so the audit trail survives profile edits
  -- and account deletion.
  select
    coalesce(nullif(trim(pr.full_name), ''), split_part(u.email, '@', 1), 'Anónimo'),
    u.email
  into v_name, v_email
  from auth.users u
  left join public.profiles pr on pr.id = u.id
  where u.id = v_uid;

  insert into public.bids (product_id, user_id, bidder_name, bidder_email, amount)
  values (p_product_id, v_uid, v_name, coalesce(v_email, ''), p_amount)
  returning id into v_bid_id;

  update public.auctions
  set current_bid   = p_amount,
      bid_count     = bid_count + 1,
      leader_user_id = v_uid,
      ends_at       = v_new_ends
  where product_id = p_product_id;

  return jsonb_build_object(
    'ok', true,
    'bid_id', v_bid_id,
    'current_bid', p_amount,
    'bid_count', v_auction.bid_count + 1,
    'ends_at', v_new_ends,
    'extended', v_new_ends <> v_auction.ends_at
  );
end;
$$;

-- Signed-in customers only — anon gets the login dialog client-side.
revoke execute on function public.place_bid(uuid, numeric) from public, anon;
grant execute on function public.place_bid(uuid, numeric) to authenticated;
