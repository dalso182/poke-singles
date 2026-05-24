-- Category-targeted coupons: scope the coupon RPCs to a coupon's
-- `category_ids` allow-list (added in 20260524000200).
--
-- The discount now applies only to the "eligible" portion of the cart — the
-- items whose category_id is in `category_ids`. NULL/empty category_ids keeps
-- the prior whole-cart behavior. The eligible amount uses the EFFECTIVE price
-- coalesce(sale_price, price), matching how the cart/listings price items
-- (see 20260524000000_product_sale_price). Coupons require auth, so the
-- signed-in cart always lives in cart_items and the server computes the
-- eligible subtotal itself (the client can't, on first apply, because it
-- doesn't yet know the coupon's categories). place_order stays authoritative.

-- ---------------------------------------------------------------
-- validate_coupon: now checks against the eligible subtotal.
-- p_subtotal is kept for signature stability but is advisory only — the
-- eligible amount is derived from the user's DB cart.
-- New error: NO_ELIGIBLE_ITEMS (targeted coupon, no matching cart items).
-- ---------------------------------------------------------------
create or replace function public.validate_coupon(
  p_code     text,
  p_subtotal numeric
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_code     text;
  v_coupon   public.coupons%rowtype;
  v_count    integer;
  v_targeted boolean;
  v_eligible numeric(12, 2);
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'AUTH_REQUIRED');
  end if;

  v_code := upper(trim(coalesce(p_code, '')));
  if v_code = '' then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  select * into v_coupon
  from public.coupons
  where code = v_code and deleted_at is null
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  if not v_coupon.is_active then
    return jsonb_build_object('ok', false, 'error', 'INACTIVE');
  end if;
  if v_coupon.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'EXPIRED');
  end if;

  select count(*) into v_count
  from public.coupon_redemptions
  where coupon_id = v_coupon.id and user_id = v_uid;
  if v_count >= v_coupon.max_uses_per_user then
    return jsonb_build_object('ok', false, 'error', 'LIMIT_REACHED');
  end if;

  -- Eligible subtotal: the portion of the signed-in cart this coupon covers,
  -- priced at coalesce(sale_price, price).
  v_targeted := v_coupon.category_ids is not null
                and array_length(v_coupon.category_ids, 1) is not null;

  select coalesce(sum(coalesce(p.sale_price, p.price) * ci.quantity), 0)
  into v_eligible
  from public.cart_items ci
  join public.products p on p.id = ci.product_id
  where ci.user_id = v_uid
    and p.active and p.price > 0 and p.quantity > 0
    and (not v_targeted or p.category_id = any (v_coupon.category_ids));

  if v_targeted and v_eligible <= 0 then
    return jsonb_build_object('ok', false, 'error', 'NO_ELIGIBLE_ITEMS');
  end if;

  if v_coupon.min_purchase_amount is not null
     and v_eligible < v_coupon.min_purchase_amount then
    return jsonb_build_object(
      'ok', false,
      'error', 'BELOW_MINIMUM',
      'gap', (v_coupon.min_purchase_amount - v_eligible)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'coupon_id', v_coupon.id,
    'type', v_coupon.type,
    'discount_value', v_coupon.discount_value,
    'min_purchase_amount', v_coupon.min_purchase_amount,
    'category_ids', v_coupon.category_ids,
    'expires_at', v_coupon.expires_at
  );
end;
$$;

grant execute on function public.validate_coupon(text, numeric) to authenticated;

-- ---------------------------------------------------------------
-- calculate_coupon_discount: discount over the eligible subtotal.
-- p_subtotal kept for signature stability but advisory — eligible amount is
-- derived from the caller's DB cart (auth.uid()), priced at the effective
-- price coalesce(sale_price, price).
-- ---------------------------------------------------------------
create or replace function public.calculate_coupon_discount(
  p_coupon_id uuid,
  p_subtotal  numeric
) returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_coupon   public.coupons%rowtype;
  v_targeted boolean;
  v_eligible numeric(12, 2);
  v_amount   numeric(12, 2);
begin
  if p_coupon_id is null then
    return 0;
  end if;
  select * into v_coupon from public.coupons where id = p_coupon_id;
  if not found or v_coupon.deleted_at is not null or not v_coupon.is_active then
    return 0;
  end if;

  v_targeted := v_coupon.category_ids is not null
                and array_length(v_coupon.category_ids, 1) is not null;

  select coalesce(sum(coalesce(p.sale_price, p.price) * ci.quantity), 0)
  into v_eligible
  from public.cart_items ci
  join public.products p on p.id = ci.product_id
  where ci.user_id = v_uid
    and p.active and p.price > 0 and p.quantity > 0
    and (not v_targeted or p.category_id = any (v_coupon.category_ids));

  if v_eligible <= 0 then
    return 0;
  end if;

  if v_coupon.type = 'PERCENTAGE' then
    v_amount := round(v_eligible * v_coupon.discount_value / 100, 2);
  elsif v_coupon.type = 'FIXED_ON_THRESHOLD' then
    if v_coupon.min_purchase_amount is null
       or v_eligible < v_coupon.min_purchase_amount then
      return 0;
    end if;
    v_amount := v_coupon.discount_value;
  else
    return 0;
  end if;

  -- Cap at the eligible portion so the discount never exceeds it.
  if v_amount > v_eligible then v_amount := v_eligible; end if;
  return v_amount;
end;
$$;

grant execute on function public.calculate_coupon_discount(uuid, numeric) to authenticated;

-- ---------------------------------------------------------------
-- get_my_applied_coupon: now returns category_ids so the cart can hydrate
-- the scope and run the client-side discount mirror correctly.
-- ---------------------------------------------------------------
create or replace function public.get_my_applied_coupon()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_id     uuid;
  v_coupon public.coupons%rowtype;
begin
  if v_uid is null then return null; end if;
  select coupon_id into v_id from public.carts where user_id = v_uid;
  if v_id is null then return null; end if;
  select * into v_coupon
  from public.coupons
  where id = v_id and deleted_at is null and is_active and expires_at > now();
  if not found then return null; end if;
  return jsonb_build_object(
    'coupon_id', v_coupon.id,
    'code', v_coupon.code,
    'type', v_coupon.type,
    'discount_value', v_coupon.discount_value,
    'min_purchase_amount', v_coupon.min_purchase_amount,
    'category_ids', v_coupon.category_ids
  );
end;
$$;

grant execute on function public.get_my_applied_coupon() to authenticated;
