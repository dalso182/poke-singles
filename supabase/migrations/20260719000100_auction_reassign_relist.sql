-- Non-payment handling for auctions, both admin-invoked from
-- /admin/auctions/:id:
--
--   reassign_auction_winner — the winner never paid: cancel their order (via
--   cancel_order, so restock/coupon-release/loyalty-reversal all behave
--   exactly like a manual admin cancellation) and crown the next-highest
--   eligible bidder with a fresh order + winner email. The defaulting winner
--   is excluded from this pick; for repeat offenders, ban them first
--   (auction_create_winner_order always skips banned bidders).
--
--   relist_auction — run the auction again: cancel the winner order if one
--   exists, archive the current round's bids (invalidated_at — audit kept,
--   live views hide them), reset the live state and reopen with a new close.
--
-- Both call cancel_order(), whose is_admin() check passes because the JWT
-- claim is request-scoped and visible inside nested security-definer calls.

create or replace function public.reassign_auction_winner(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_auction  public.auctions%rowtype;
  v_old_user uuid;
  v_cancel   jsonb;
  v_result   jsonb;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select * into v_auction
  from public.auctions
  where product_id = p_product_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_AN_AUCTION');
  end if;
  if v_auction.status <> 'ended' or v_auction.winner_order_id is null then
    return jsonb_build_object('ok', false, 'error', 'NO_WINNER_TO_REASSIGN');
  end if;

  v_old_user := v_auction.winner_user_id;

  -- Cancel the defaulted order. ALREADY_TERMINAL (admin cancelled it by hand
  -- first) is fine — stock was already restored on that path.
  v_cancel := public.cancel_order(
    v_auction.winner_order_id,
    'Subasta reasignada — el ganador no completó el pago.'
  );
  if (v_cancel ->> 'ok')::boolean is distinct from true
     and v_cancel ->> 'error' is distinct from 'ALREADY_TERMINAL' then
    return jsonb_build_object('ok', false, 'error', 'CANCEL_FAILED', 'detail', v_cancel);
  end if;

  v_result := public.auction_create_winner_order(p_product_id, p_exclude_user := v_old_user);

  if v_result is null then
    -- Nobody eligible left: close out as void and put the card back on sale
    -- state-wise (stock already restored by the cancel above).
    update public.auctions
    set status          = 'void',
        closed_at       = now(),
        winner_user_id  = null,
        winner_bid_id   = null,
        winner_order_id = null,
        winner_name     = null,
        winner_email    = null
    where product_id = p_product_id;
    return jsonb_build_object('ok', true, 'outcome', 'void');
  end if;

  -- winner_order_id transition re-fires auctions_notify_result → the new
  -- winner gets their email automatically.
  update public.auctions
  set winner_user_id  = (v_result ->> 'user_id')::uuid,
      winner_bid_id   = (v_result ->> 'bid_id')::uuid,
      winner_order_id = (v_result ->> 'order_id')::uuid,
      winner_name     = v_result ->> 'winner_name',
      winner_email    = v_result ->> 'winner_email'
  where product_id = p_product_id;

  return jsonb_build_object(
    'ok', true,
    'outcome', 'reassigned',
    'winner_name', v_result ->> 'winner_name',
    'order_id', v_result ->> 'order_id'
  );
end;
$$;

grant execute on function public.reassign_auction_winner(uuid) to authenticated;

create or replace function public.relist_auction(p_product_id uuid, p_ends_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_auction public.auctions%rowtype;
  v_cancel  jsonb;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if p_ends_at is null or p_ends_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'INVALID_END_DATE');
  end if;

  select * into v_auction
  from public.auctions
  where product_id = p_product_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_AN_AUCTION');
  end if;
  if v_auction.status not in ('ended', 'void') then
    return jsonb_build_object('ok', false, 'error', 'AUCTION_STILL_ACTIVE');
  end if;

  if v_auction.winner_order_id is not null then
    v_cancel := public.cancel_order(
      v_auction.winner_order_id,
      'Subasta relanzada — se canceló el pedido del ganador anterior.'
    );
    if (v_cancel ->> 'ok')::boolean is distinct from true
       and v_cancel ->> 'error' is distinct from 'ALREADY_TERMINAL' then
      return jsonb_build_object('ok', false, 'error', 'CANCEL_FAILED', 'detail', v_cancel);
    end if;
  end if;

  -- Archive this round's bids; audit history stays, live reads filter it out
  -- (first fresh bid must meet the starting price again).
  update public.bids
  set invalidated_at = now()
  where product_id = p_product_id and invalidated_at is null;

  update public.auctions
  set status           = 'active',
      ends_at          = p_ends_at,
      current_bid      = null,
      bid_count        = 0,
      leader_user_id   = null,
      winner_user_id   = null,
      winner_bid_id    = null,
      winner_order_id  = null,
      winner_name      = null,
      winner_email     = null,
      reminder_sent_at = null,
      notified_at      = null,
      closed_at        = null,
      relist_count     = relist_count + 1
  where product_id = p_product_id;

  -- Belt-and-braces: a void close never touched stock and the cancel above
  -- restores it, but make sure exactly one unit is on offer again.
  update public.products
  set quantity = 1
  where id = p_product_id and quantity = 0;

  return jsonb_build_object('ok', true, 'ends_at', p_ends_at);
end;
$$;

grant execute on function public.relist_auction(uuid, timestamptz) to authenticated;
