-- get_guest_order: confirmation-page lookup. Anon or auth callable;
-- requires id + email match so a leaked order_id alone isn't enough.
create or replace function public.get_guest_order(p_order_id uuid, p_email text)
returns jsonb
language plpgsql stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_items jsonb;
begin
  select * into v_order from public.orders
  where id = p_order_id and lower(customer_email) = lower(trim(coalesce(p_email, '')));
  if not found then return null; end if;
  select coalesce(jsonb_agg(to_jsonb(oi.*) order by oi.created_at), '[]'::jsonb)
  into v_items
  from public.order_items oi where oi.order_id = v_order.id;
  return jsonb_build_object('order', to_jsonb(v_order), 'items', v_items);
end;
$$;

grant execute on function public.get_guest_order(uuid, text) to anon, authenticated;

-- attach_payment_proof: customer marks an order as having a proof. Either
-- a Storage path (after upload) or the sentinel '__whatsapp__' (after the
-- customer clicks "ya envié por WhatsApp"). Verifies email match + that
-- the order is still in 'pending' status, so callers can't retroactively
-- flip status fields. Customers don't get UPDATE on orders directly.
create or replace function public.attach_payment_proof(
  p_order_id  uuid,
  p_email     text,
  p_file_path text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders
  where id = p_order_id and lower(customer_email) = lower(trim(coalesce(p_email, '')));
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  if v_order.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'NOT_PENDING');
  end if;
  if v_order.payment_method <> 'sinpe_or_transfer' then
    return jsonb_build_object('ok', false, 'error', 'WRONG_PAYMENT_METHOD');
  end if;
  update public.orders
  set payment_proof_url = trim(p_file_path)
  where id = p_order_id;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.attach_payment_proof(uuid, text, text) to anon, authenticated;
