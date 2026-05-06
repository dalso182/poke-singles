-- Coupon RPCs. All security definer with explicit search_path to prevent
-- search-path attacks. Only `authenticated` may execute.
--
-- TODO(security): rate-limit per user/IP via an Edge Function wrapper or
-- pg_throttle-style table once coupon traffic justifies it.

-- ---------------------------------------------------------------
-- validate_coupon: check a code against the cart subtotal.
-- ---------------------------------------------------------------
-- Returns { ok: true, coupon_id, type, discount_value, min_purchase_amount,
-- expires_at } on success; { ok: false, error: '<CODE>' [, gap: number] }
-- on failure. Error codes are machine-readable; the UI maps them to Spanish
-- copy via mapCouponError() on the client.

create or replace function public.validate_coupon(
  p_code     text,
  p_subtotal numeric
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_code   text;
  v_coupon public.coupons%rowtype;
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

  -- TODO(orders-plan): once coupon_redemptions exists, count this user's
  -- redemptions for v_coupon.id and reject when >= max_uses_per_user. Until
  -- then we silently allow re-use. The column exists on the row so admins
  -- can configure it ahead of time.

  if v_coupon.min_purchase_amount is not null
     and p_subtotal < v_coupon.min_purchase_amount then
    return jsonb_build_object(
      'ok', false,
      'error', 'BELOW_MINIMUM',
      'gap', (v_coupon.min_purchase_amount - p_subtotal)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'coupon_id', v_coupon.id,
    'type', v_coupon.type,
    'discount_value', v_coupon.discount_value,
    'min_purchase_amount', v_coupon.min_purchase_amount,
    'expires_at', v_coupon.expires_at
  );
end;
$$;

grant execute on function public.validate_coupon(text, numeric) to authenticated;

-- ---------------------------------------------------------------
-- calculate_coupon_discount: pure math, no auth.
-- ---------------------------------------------------------------
-- Returns 0 for unknown / null / inactive / soft-deleted coupons so the
-- caller can pipeline this safely. Caps at p_subtotal so the discount can
-- never exceed cart value.

create or replace function public.calculate_coupon_discount(
  p_coupon_id uuid,
  p_subtotal  numeric
) returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_coupon public.coupons%rowtype;
  v_amount numeric(12, 2);
begin
  if p_coupon_id is null or p_subtotal is null or p_subtotal <= 0 then
    return 0;
  end if;
  select * into v_coupon from public.coupons where id = p_coupon_id;
  if not found or v_coupon.deleted_at is not null or not v_coupon.is_active then
    return 0;
  end if;

  if v_coupon.type = 'PERCENTAGE' then
    v_amount := round(p_subtotal * v_coupon.discount_value / 100, 2);
  elsif v_coupon.type = 'FIXED_ON_THRESHOLD' then
    if v_coupon.min_purchase_amount is null
       or p_subtotal < v_coupon.min_purchase_amount then
      return 0;
    end if;
    v_amount := v_coupon.discount_value;
  else
    return 0;
  end if;

  if v_amount > p_subtotal then v_amount := p_subtotal; end if;
  return v_amount;
end;
$$;

grant execute on function public.calculate_coupon_discount(uuid, numeric) to authenticated;

-- ---------------------------------------------------------------
-- get_my_applied_coupon: return the coupon the current user has saved on
-- their cart, or NULL if none / expired / inactive / deleted.
-- ---------------------------------------------------------------
-- Lets the cart hydrate the applied-coupon signal without granting
-- customers a direct read on `coupons`. Quietly drops stale references.

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
    'min_purchase_amount', v_coupon.min_purchase_amount
  );
end;
$$;

grant execute on function public.get_my_applied_coupon() to authenticated;
