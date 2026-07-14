import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { environment } from '../src/environments/environment';

export interface Fixtures {
  products: { id: string; slug: string; name: string; price: number }[];
  user: { id: string; email: string };
  admin: { id: string; email: string };
  guestEmail: string;
  coupon: { id: string; code: string; percent: number };
  limitCoupon: { id: string; code: string; percent: number };
  pickupMethod: { id: string; name: string; price: number };
  restrictedMethod: { id: string; name: string };
  seededAt: string;
}

/** Written by scripts/e2e-seed.mjs (via global-setup) before the suite runs. */
export function loadFixtures(): Fixtures {
  const file = path.join(__dirname, '.fixtures.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Fixtures;
}

/** 1×1 transparent PNG — the smallest valid payment-proof upload. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * The app (anon clients here) targets environment.ts while the seed/cleanup
 * scripts and serviceClient() target SUPABASE_DEV_URL. If those ever point at
 * different projects (e.g. a repoint updated one but not the other), the RPC
 * specs would write orders to one project while cleanup sweeps the other —
 * refuse to run instead.
 */
function assertSameProject(): void {
  const envUrl = process.env['SUPABASE_DEV_URL'];
  if (!envUrl) return; // serviceClient() rejects this case with its own error
  const appHost = new URL(environment.supabase.url).hostname;
  const devHost = new URL(envUrl).hostname;
  if (appHost !== devHost) {
    throw new Error(
      `e2e project mismatch: environment.ts points at ${appHost} but ` +
        `SUPABASE_DEV_URL points at ${devHost}. Align them before running the suite.`,
    );
  }
}

/** Canonical guest place_order payload; override per test. */
export function makeGuestOrderInput(
  fx: Fixtures,
  overrides: Record<string, unknown> = {},
) {
  return {
    items: [{ product_id: fx.products[0].id, quantity: 1 }],
    buyer: {
      email: fx.guestEmail,
      name: 'E2E Guest',
      phone: '88880000',
      address: null,
    },
    shipping_method_id: fx.pickupMethod.id,
    payment_method: 'sinpe_or_transfer',
    ...overrides,
  };
}

/**
 * Marks the first-visit welcome modal as already dismissed so it never
 * opens over the elements the tests click.
 */
export async function dismissOnboarding(page: Page): Promise<void> {
  await page.addInitScript(() =>
    window.localStorage.setItem('welcome:dismissed:v1', '1'),
  );
}

/**
 * Intercepts the fire-and-forget send-order-email edge-function call so no
 * real Resend email (customer or admin) ever goes out during a test order.
 * Fulfilled (not aborted) so the client's .catch stays silent.
 */
export async function blockOrderEmail(page: Page): Promise<void> {
  await page.route('**/functions/v1/send-order-email', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    }),
  );
}

/** Anon-key client — same access level as the storefront (guest). */
export function anonClient() {
  assertSameProject();
  const { url, anonKey } = environment.supabase;
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

/** Anon-key client signed in as the given user — RPCs carry their JWT
 *  (e.g. the seeded e2e admin for is_admin()-guarded functions). */
export async function signedInClient(email: string, password: string) {
  assertSameProject();
  const { url, anonKey } = environment.supabase;
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`e2e sign-in failed for ${email}: ${error.message}`);
  return client;
}

/** Service-role client for seeding-free DB assertions from Node. */
export function serviceClient() {
  const url = process.env['SUPABASE_DEV_URL'];
  const key = process.env['SUPABASE_DEV_SERVICE_ROLE_KEY'];
  if (!url || !key) {
    throw new Error('SUPABASE_DEV_URL / SUPABASE_DEV_SERVICE_ROLE_KEY missing from .env.local');
  }
  assertSameProject();
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Signs in Node-side with the anon key and plants the session in
 * localStorage before the app boots, so the page loads already signed in
 * (supabase-js v2 storage key: sb-<project-ref>-auth-token).
 */
export async function signInViaToken(page: Page, email: string, password: string): Promise<void> {
  const { url, anonKey } = environment.supabase;
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`e2e sign-in failed for ${email}: ${error?.message ?? 'no session'}`);
  }
  const projectRef = new URL(url).hostname.split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const session = data.session;
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [storageKey, JSON.stringify(session)] as const,
  );
}
