import { expect, test } from '@playwright/test';
import {
  blockOrderEmail,
  dismissOnboarding,
  loadFixtures,
  serviceClient,
  signInViaToken,
} from './helpers';

const fx = loadFixtures();
const cardB = fx.products.find((p) => p.slug === 'e2e-test-card-b')!;
const expectedDiscount = Math.round(cardB.price * fx.coupon.percent) / 100;

test('signed-in customer can order with a coupon applied', async ({ page }) => {
  await blockOrderEmail(page);
  await dismissOnboarding(page);
  await signInViaToken(page, fx.user.email, process.env['E2E_USER_PASSWORD']!);

  await page.goto(`/products/${cardB.slug}`);
  await page.getByTestId('add-to-cart').click();
  await page.getByTestId('drawer-checkout').click();
  await expect(page).toHaveURL(/\/checkout$/);

  // Signed-in checkout locks the email to the account address.
  const email = page.getByRole('textbox', { name: 'Correo' });
  await expect(email).toHaveValue(fx.user.email);
  await expect(email).toBeDisabled();

  await page.getByRole('textbox', { name: 'Nombre completo' }).fill('E2E Customer');
  await page.getByRole('textbox', { name: 'Teléfono' }).fill('88881111');

  // Apply the seeded 10% coupon and confirm the discount row shows up.
  // Scoped to the checkout form — the cart drawer keeps its own (hidden)
  // coupon field in the DOM.
  const checkout = page.locator('form.checkout__layout');
  await checkout.getByTestId('coupon-input').fill(fx.coupon.code);
  await checkout.getByTestId('coupon-apply').click();
  await expect(page.getByTestId('discount-row')).toContainText(fx.coupon.code);
  await expect(page.getByTestId('discount-row')).toContainText(
    `${Math.round(expectedDiscount)}`,
  );

  await page.getByTestId(`shipping-${fx.pickupMethod.id}`).click();
  await page.getByTestId('checkout-submit').click();

  await expect(page).toHaveURL(/\/checkout\/confirmation\/[0-9a-f-]{36}/);
  await expect(page.getByTestId('order-ref')).toHaveText(/#\d+/);

  const orderId = page.url().match(/confirmation\/([0-9a-f-]{36})/)![1];
  const db = serviceClient();

  const { data: order, error } = await db
    .from('orders')
    .select('status, total, subtotal, discount_amount, coupon_code, user_id')
    .eq('id', orderId)
    .single();
  expect(error).toBeNull();
  expect(order).toMatchObject({
    status: 'pending',
    user_id: fx.user.id,
    coupon_code: fx.coupon.code,
    subtotal: cardB.price,
    discount_amount: expectedDiscount,
    total: cardB.price - expectedDiscount + fx.pickupMethod.price,
  });

  // The coupon redemption was recorded against this order and user.
  const { data: redemptions } = await db
    .from('coupon_redemptions')
    .select('user_id, discount_amount_applied')
    .eq('order_id', orderId);
  expect(redemptions).toHaveLength(1);
  expect(redemptions![0]).toMatchObject({
    user_id: fx.user.id,
    discount_amount_applied: expectedDiscount,
  });

  // place_order cleared the server-side cart.
  const { data: cartItems } = await db
    .from('cart_items')
    .select('product_id')
    .eq('user_id', fx.user.id);
  expect(cartItems).toEqual([]);
});
