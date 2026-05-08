-- Atomic order cancellation. Locks the order, restores stock for each
-- line whose product still exists, flips status to 'cancelled'. Admin-only.
-- Forward transitions (paid → shipped → completed) don't need an RPC —
-- the orders_admin_all RLS policy lets admins UPDATE directly, no side
-- effects required.

create or replace function public.cancel_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_item  public.order_items%rowtype;
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

  -- Restore stock for items whose product still exists. Snapshot rows
  -- whose product was deleted just stay in the order_items table; the
  -- product_id FK was set NULL on cascade.
  for v_item in
    select * from public.order_items where order_id = p_order_id
  loop
    if v_item.product_id is not null then
      update public.products
      set quantity = quantity + v_item.quantity
      where id = v_item.product_id;
    end if;
  end loop;

  update public.orders set status = 'cancelled' where id = p_order_id;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.cancel_order(uuid) to authenticated;
