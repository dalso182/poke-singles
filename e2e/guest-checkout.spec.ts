import { expect, test } from '@playwright/test';
import { blockOrderEmail, dismissOnboarding, loadFixtures, serviceClient } from './helpers';

const fx = loadFixtures();
const cardA = fx.products.find((p) => p.slug === 'e2e-test-card-a')!;

test('guest can order a card for pickup and lands on the confirmation page', async ({ page }) => {
  await blockOrderEmail(page);
  await dismissOnboarding(page);

  // Product page → add to cart → drawer → checkout.
  await page.goto(`/products/${cardA.slug}`);
  await page.getByTestId('add-to-cart').click();
  await page.getByTestId('drawer-checkout').click();
  await expect(page).toHaveURL(/\/checkout$/);

  // Contact info (guest — the email field is editable).
  await page.getByRole('textbox', { name: 'Correo' }).fill(fx.guestEmail);
  await page.getByRole('textbox', { name: 'Nombre completo' }).fill('E2E Guest');
  await page.getByRole('textbox', { name: 'Teléfono' }).fill('88880000');

  // Pickup shipping → no address form should be rendered.
  await page.getByTestId(`shipping-${fx.pickupMethod.id}`).click();
  await expect(page.locator('input[formcontrolname="line1"]')).toHaveCount(0);

  // Payment stays on the SINPE default; place the order.
  await page.getByTestId('checkout-submit').click();

  // Confirmation page with a human-readable order ref + SINPE instructions.
  await expect(page).toHaveURL(/\/checkout\/confirmation\/[0-9a-f-]{36}/);
  await expect(page.getByTestId('order-ref')).toHaveText(/#\d+/);
  await expect(page.getByText('¡Recibimos tu pedido!')).toBeVisible();

  // DB double-check: the RPC persisted what the UI claims.
  const orderId = page.url().match(/confirmation\/([0-9a-f-]{36})/)![1];
  const db = serviceClient();
  const { data: order, error } = await db
    .from('orders')
    .select('status, total, subtotal, customer_email, shipping_amount')
    .eq('id', orderId)
    .single();
  expect(error).toBeNull();
  expect(order).toMatchObject({
    status: 'pending',
    customer_email: fx.guestEmail,
    subtotal: cardA.price,
    shipping_amount: fx.pickupMethod.price,
    total: cardA.price + fx.pickupMethod.price,
  });
});
