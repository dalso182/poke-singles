-- Activate the max_uses_per_user count check now that coupon_redemptions
-- exists. The earlier version of validate_coupon had a TODO; this lifts it.
-- Authenticated-only check (matches the AUTH_REQUIRED short-circuit).
-- Guest enforcement at order time happens inside place_order via guest_email.

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
  v_count  integer;
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
