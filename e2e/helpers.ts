import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { environment } from '../src/environments/environment';

export interface Fixtures {
  products: { id: string; slug: string; name: string; price: number }[];
  user: { id: string; email: string };
  guestEmail: string;
  coupon: { id: string; code: string; percent: number };
  pickupMethod: { id: string; name: string; price: number };
  seededAt: string;
}

/** Written by scripts/e2e-seed.mjs (via global-setup) before the suite runs. */
export function loadFixtures(): Fixtures {
  const file = path.join(__dirname, '.fixtures.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Fixtures;
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

/** Service-role client for seeding-free DB assertions from Node. */
export function serviceClient() {
  const url = process.env['SUPABASE_DEV_URL'];
  const key = process.env['SUPABASE_DEV_SERVICE_ROLE_KEY'];
  if (!url || !key) {
    throw new Error('SUPABASE_DEV_URL / SUPABASE_DEV_SERVICE_ROLE_KEY missing from .env.local');
  }
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
