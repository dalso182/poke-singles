-- Cancellation must release the coupon redemption so the customer's
-- max_uses_per_user counter goes back down. Without this, a coupon used on a
-- now-cancelled order still counts against the cap, blocking re-use. Affects
-- both auth'd customers (user_id match in validate_coupon) and guests
-- (guest_email match inside place_order).
--
-- Signature is unchanged ((uuid, text default null)) — body-only refresh.
-- The DELETE is a safe no-op when the cancelled order had no coupon.

create or replace function public.cancel_order(
  p_order_id uuid,
  p_notes    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_item  public.order_items%rowtype;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'NOT_ADMIN');
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  if v_order.status in ('cancelled', 'completed') then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_TERMINAL');
  end if;

  -- Restore stock for every line whose product still exists.
  for v_item in
    select * from public.order_items where order_id = p_order_id
  loop
    if v_item.product_id is not null then
      update public.products
      set quantity = quantity + v_item.quantity
      where id = v_item.product_id;
    end if;
  end loop;

  -- Release the coupon redemption (if any) so the customer's
  -- max_uses_per_user counter goes back down. Safe no-op when no row exists.
  delete from public.coupon_redemptions
  where order_id = p_order_id;

  update public.orders
  set status = 'cancelled',
      cancellation_notes = v_notes
  where id = p_order_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.cancel_order(uuid, text) to authenticated;
