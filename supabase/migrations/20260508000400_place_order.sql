-- Atomic order creation. Single transaction:
--  1. Validate buyer + payment + shipping inputs.
--  2. Lock each product row, verify active + price > 0 + sufficient stock.
--  3. (Optional) Lock + recount the coupon for race-safe max_uses_per_user.
--  4. Insert orders row.
--  5. Snapshot order_items + decrement product.quantity.
--  6. Insert coupon_redemptions row.
--  7. Clear cart_items + carts.coupon_id for signed-in users.
--
-- Returns { ok: true, order_id, total } or { ok: false, error: '<CODE>', ... }.

create or replace function public.place_order(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid          uuid := auth.uid();
  v_email        text;
  v_items        jsonb;
  v_item         jsonb;
  v_product      public.products%rowtype;
  v_subtotal     numeric(12, 2) := 0;
  v_qty          integer;
  v_shipping_id  uuid;
  v_shipping     public.shipping_methods%rowtype;
  v_payment      text;
  v_coupon_code  text;
  v_coupon       public.coupons%rowtype;
  v_discount     numeric(12, 2) := 0;
  v_total        numeric(12, 2);
  v_order_id     uuid;
  v_user_redempt integer;
  v_email_redempt integer;
  v_name         text;
  v_phone        text;
begin
  -- ---- Inputs ----
  v_email := lower(trim(coalesce(p_input -> 'buyer' ->> 'email', '')));
  v_name  := trim(coalesce(p_input -> 'buyer' ->> 'name',  ''));
  v_phone := trim(coalesce(p_input -> 'buyer' ->> 'phone', ''));
  if v_email = '' then
    return jsonb_build_object('ok', false, 'error', 'EMAIL_REQUIRED');
  end if;
  if v_name = '' or v_phone = '' then
    return jsonb_build_object('ok', false, 'error', 'BUYER_INFO_REQUIRED');
  end if;

  v_items := p_input -> 'items';
  if v_items is null or jsonb_array_length(v_items) = 0 then
    return jsonb_build_object('ok', false, 'error', 'EMPTY_CART');
  end if;

  v_payment := p_input ->> 'payment_method';
  if v_payment is null or v_payment not in ('sinpe_or_transfer','payment_link') then
    return jsonb_build_object('ok', false, 'error', 'INVALID_PAYMENT');
  end if;

  -- ---- Shipping method (snapshot name + price) ----
  begin
    v_shipping_id := (p_input ->> 'shipping_method_id')::uuid;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'INVALID_SHIPPING');
  end;
  if v_shipping_id is null then
    return jsonb_build_object('ok', false, 'error', 'INVALID_SHIPPING');
  end if;
  select * into v_shipping
  from public.shipping_methods
  where id = v_shipping_id and is_active = true and deleted_at is null
  for share;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'INVALID_SHIPPING');
  end if;

  -- ---- Validate + lock products, compute subtotal ----
  for v_item in select * from jsonb_array_elements(v_items) loop
    v_qty := (v_item ->> 'quantity')::int;
    if v_qty is null or v_qty <= 0 then
      return jsonb_build_object('ok', false, 'error', 'INVALID_QTY');
    end if;
    select * into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid
    for update;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'PRODUCT_GONE');
    end if;
    if not v_product.active or v_product.price <= 0 then
      return jsonb_build_object(
        'ok', false, 'error', 'PRODUCT_UNAVAILABLE',
        'product_id', v_product.id
      );
    end if;
    if v_product.quantity < v_qty then
      return jsonb_build_object(
        'ok', false, 'error', 'INSUFFICIENT_STOCK',
        'product_id', v_product.id, 'available', v_product.quantity
      );
    end if;
    v_subtotal := v_subtotal + (v_product.price * v_qty);
  end loop;

  -- ---- Coupon (optional) ----
  v_coupon_code := upper(trim(coalesce(p_input ->> 'coupon_code', '')));
  if v_coupon_code <> '' then
    select * into v_coupon
    from public.coupons
    where code = v_coupon_code
      and deleted_at is null and is_active and expires_at > now()
    for update;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'COUPON_INVALID');
    end if;
    if v_coupon.min_purchase_amount is not null
       and v_subtotal < v_coupon.min_purchase_amount then
      return jsonb_build_object('ok', false, 'error', 'COUPON_BELOW_MINIMUM');
    end if;
    -- Per-user limit (signed-in only).
    if v_uid is not null then
      select count(*) into v_user_redempt
      from public.coupon_redemptions
      where coupon_id = v_coupon.id and user_id = v_uid;
      if v_user_redempt >= v_coupon.max_uses_per_user then
        return jsonb_build_object('ok', false, 'error', 'COUPON_LIMIT');
      end if;
    end if;
    -- Per-email limit (covers both guest and signed-in re-uses with the
    -- same email, in case a guest later signs up).
    select count(*) into v_email_redempt
    from public.coupon_redemptions
    where coupon_id = v_coupon.id
      and lower(coalesce(guest_email, '')) = v_email;
    if v_email_redempt >= v_coupon.max_uses_per_user then
      return jsonb_build_object('ok', false, 'error', 'COUPON_LIMIT');
    end if;
    if v_coupon.type = 'PERCENTAGE' then
      v_discount := round(v_subtotal * v_coupon.discount_value / 100, 2);
    elsif v_coupon.type = 'FIXED_ON_THRESHOLD' then
      v_discount := v_coupon.discount_value;
    end if;
    if v_discount > v_subtotal then v_discount := v_subtotal; end if;
  end if;

  v_total := v_subtotal - v_discount + v_shipping.price;

  -- ---- Insert order header ----
  insert into public.orders (
    user_id, customer_email, customer_name, customer_phone,
    shipping_address, shipping_method_id, shipping_method_name, shipping_amount,
    payment_method, subtotal, discount_amount, coupon_id, coupon_code,
    total, customer_notes
  ) values (
    v_uid, v_email, v_name, v_phone,
    p_input -> 'buyer' -> 'address',
    v_shipping.id, v_shipping.name, v_shipping.price,
    v_payment, v_subtotal, v_discount,
    case when v_coupon.id is not null then v_coupon.id else null end,
    case when v_coupon.id is not null then v_coupon.code else null end,
    v_total, p_input ->> 'customer_notes'
  ) returning id into v_order_id;

  -- ---- Snapshot items + decrement stock ----
  for v_item in select * from jsonb_array_elements(v_items) loop
    select * into v_product from public.products
    where id = (v_item ->> 'product_id')::uuid;
    v_qty := (v_item ->> 'quantity')::int;
    insert into public.order_items (
      order_id, product_id, product_slug, product_name,
      product_image_url, product_condition, unit_price, quantity, line_total
    ) values (
      v_order_id, v_product.id, v_product.slug, v_product.name,
      v_product.image_url, v_product.condition,
      v_product.price, v_qty, v_product.price * v_qty
    );
    update public.products
    set quantity = quantity - v_qty
    where id = v_product.id;
  end loop;

  -- ---- Redeem coupon ----
  if v_coupon.id is not null then
    insert into public.coupon_redemptions (
      coupon_id, user_id, guest_email, order_id, discount_amount_applied
    ) values (
      v_coupon.id, v_uid,
      case when v_uid is null then v_email else null end,
      v_order_id, v_discount
    );
  end if;

  -- ---- Clear DB cart for signed-in users ----
  if v_uid is not null then
    delete from public.cart_items where user_id = v_uid;
    update public.carts set coupon_id = null, updated_at = now() where user_id = v_uid;
  end if;

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'total', v_total
  );
end;
$$;

grant execute on function public.place_order(jsonb) to anon, authenticated;
