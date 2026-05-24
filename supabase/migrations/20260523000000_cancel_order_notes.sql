-- Add optional cancellation notes to orders so admins can capture WHY a
-- pedido was cancelled (customer changed mind, out of stock, payment never
-- arrived, etc.) and surface that context later on the order view.
--
-- The cancel_order RPC gains a new optional `p_notes` parameter. The previous
-- 1-arg signature is dropped so the callsite uses the new shape uniformly —
-- no overload juggling.

alter table public.orders
  add column cancellation_notes text;

drop function if exists public.cancel_order(uuid);

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

  for v_item in
    select * from public.order_items where order_id = p_order_id
  loop
    if v_item.product_id is not null then
      update public.products
      set quantity = quantity + v_item.quantity
      where id = v_item.product_id;
    end if;
  end loop;

  update public.orders
  set status = 'cancelled',
      cancellation_notes = v_notes
  where id = p_order_id;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.cancel_order(uuid, text) to authenticated;
