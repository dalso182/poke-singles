// Supabase Edge Function: price-check
//
// POST { trigger: 'cron' | 'manual', run_id?: string, batch_size?: number }
//
// Fires from the `price-check-weekly` pg_cron job (Monday 04:00 CR) via
// pg_net, with `trigger = 'cron'`. Also callable manually for testing. The
// admin-facing "Ejecutar revisión ahora" button runs entirely in the browser
// (ReportsService.runPriceReviewNow) and does NOT call this function — both
// paths converge on the same `admin_record_price_check` RPC, so the
// price_reviews queue ends up identical regardless of trigger.
//
// One invocation processes up to `batch_size` cards (default 200), ordered
// by `products.price_checked_at` NULLS FIRST so unchecked / oldest items go
// first. If more remain after the batch, it self-chains via a fetch back to
// its own URL with the same run_id — preserving a single logical "run" even
// when the catalog is too large for one wall-clock window.
//
// Required Supabase env vars (auto-injected on hosted projects):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// `verify_jwt = false` in supabase/config.toml: pg_net calls this without a
// session JWT (the cron job authenticates via the supabase_anon_key vault
// secret, but the function itself doesn't require it).

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TCGDEX_BASE = 'https://api.tcgdex.net/v2/en/cards';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}

interface TcgplayerVariant {
  productId?: number | null;
  marketPrice?: number | null;
}

interface TcgdexCard {
  id?: string;
  pricing?: {
    tcgplayer?: Record<string, unknown> & { updated?: string };
  };
}

/** Mirrors src/app/core/catalog/tcgplayer-pricing.ts — kept in sync by hand. */
function firstTcgplayerVariant(card: TcgdexCard): TcgplayerVariant | null {
  const tp = card?.pricing?.tcgplayer;
  if (!tp) return null;
  for (const [key, val] of Object.entries(tp)) {
    if (key === 'updated' || key === 'unit') continue;
    if (val && typeof val === 'object') {
      return val as TcgplayerVariant;
    }
  }
  return null;
}

function tcgplayerMarketUsd(card: TcgdexCard): number | null {
  const price = firstTcgplayerVariant(card)?.marketPrice;
  return typeof price === 'number' && price > 0 ? price : null;
}

function tcgplayerUpdatedAt(card: TcgdexCard): string | null {
  const updated = card?.pricing?.tcgplayer?.updated;
  return typeof updated === 'string' && updated.length > 0 ? updated : null;
}

/** Fetch one card from the TCGdex REST API; null if not found / error. */
async function fetchCard(cardRef: string): Promise<TcgdexCard | null> {
  try {
    const res = await fetch(`${TCGDEX_BASE}/${encodeURIComponent(cardRef)}`);
    if (!res.ok) return null;
    return (await res.json()) as TcgdexCard;
  } catch {
    return null;
  }
}

/** Concurrency-capped Promise.all. Matches the client-side runner's helper. */
async function processConcurrent<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners: Promise<void>[] = [];
  const next = async (): Promise<void> => {
    while (cursor < items.length) {
      const i = cursor++;
      await worker(items[i]);
    }
  };
  for (let n = 0; n < Math.min(concurrency, items.length); n++) {
    runners.push(next());
  }
  await Promise.all(runners);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);

  let body: { trigger?: string; run_id?: string; batch_size?: number };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'INVALID_JSON' }, 400);
  }
  const trigger = body.trigger === 'manual' ? 'manual' : 'cron';
  const batchSize = Math.max(1, Math.min(500, Number(body.batch_size) || 200));

  const supaUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supaKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supaUrl || !supaKey) {
    return jsonResponse({ ok: false, error: 'SERVER_MISCONFIGURED' }, 500);
  }

  const supabase = createClient(supaUrl, supaKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Settings + feasibility gate.
  const { data: settings, error: settingsErr } = await supabase
    .from('app_settings')
    .select('price_review_enabled, price_review_threshold_pct, price_review_floor_crc, exchange_rate_usd_crc')
    .eq('id', true)
    .single();
  if (settingsErr) {
    return jsonResponse({ ok: false, error: 'SETTINGS_READ', detail: settingsErr.message }, 500);
  }
  if (!settings?.price_review_enabled) {
    return jsonResponse({ ok: true, skipped: 'disabled' });
  }
  const rate = Number(settings.exchange_rate_usd_crc) || 0;
  if (rate <= 0) {
    return jsonResponse({ ok: true, skipped: 'no_exchange_rate' });
  }
  const threshold = Number(settings.price_review_threshold_pct) || 10;
  const floor = Number(settings.price_review_floor_crc) || 0;

  // 2. Start (or continue) a run.
  let runId: string;
  if (body.run_id) {
    runId = body.run_id;
  } else {
    const { data: newId, error: startErr } = await supabase.rpc(
      'admin_price_review_start',
      { p_trigger: trigger },
    );
    if (startErr) {
      return jsonResponse({ ok: false, error: 'RUN_START', detail: startErr.message }, 500);
    }
    runId = newId as string;
  }

  // 3. Resolve the singles category id (cached for this invocation only —
  //    each Deno isolate gets a fresh request, so memoizing across requests
  //    isn't a goal here). Same scoping the browser runner uses.
  const { data: singlesRow, error: singlesErr } = await supabase
    .from('categories')
    .select('id')
    .eq('slug', 'singles')
    .maybeSingle();
  if (singlesErr || !singlesRow?.id) {
    await supabase.rpc('admin_price_review_finish', {
      p_run_id: runId,
      p_scanned: 0,
      p_priced: 0,
      p_flagged: 0,
      p_error: `SINGLES_CATEGORY_MISSING${singlesErr ? `: ${singlesErr.message}` : ''}`,
    });
    return jsonResponse({ ok: false, error: 'SINGLES_CATEGORY_MISSING' }, 500);
  }
  const singlesId = singlesRow.id as string;

  // 4. Pull this batch — oldest-first so unchecked items always go first.
  //    Scope: active singles in NM condition with a card_ref and price >= floor.
  const { data: rows, error: pageErr } = await supabase
    .from('products')
    .select('id, card_ref, price')
    .eq('active', true)
    .not('card_ref', 'is', null)
    .eq('condition', 'NM')
    .eq('category_id', singlesId)
    .gte('price', floor)
    .order('price_checked_at', { ascending: true, nullsFirst: true })
    .limit(batchSize);
  if (pageErr) {
    await supabase.rpc('admin_price_review_finish', {
      p_run_id: runId,
      p_scanned: 0,
      p_priced: 0,
      p_flagged: 0,
      p_error: `PAGE_READ: ${pageErr.message}`,
    });
    return jsonResponse({ ok: false, error: 'PAGE_READ', detail: pageErr.message }, 500);
  }
  const batch = (rows ?? []) as { id: string; card_ref: string; price: number }[];

  // 4. Process the batch.
  let scanned = 0;
  let priced = 0;
  let flagged = 0;
  await processConcurrent(batch, 4, async (row) => {
    const card = await fetchCard(row.card_ref);
    const variant = card ? firstTcgplayerVariant(card) : null;
    const usd = card ? tcgplayerMarketUsd(card) ?? 0 : 0;
    const updatedAt = card ? tcgplayerUpdatedAt(card) : null;
    const tcgProductId =
      typeof variant?.productId === 'number' ? variant.productId : null;
    const { data: wasFlagged, error: recErr } = await supabase.rpc(
      'admin_record_price_check',
      {
        p_product_id: row.id,
        p_store_price: row.price,
        p_market_usd: usd,
        p_exchange_rate: rate,
        p_threshold_pct: threshold,
        p_market_updated_at: updatedAt,
        p_tcgplayer_product_id: tcgProductId,
      },
    );
    if (recErr) {
      console.warn('[price-check] record_price_check failed', row.id, recErr.message);
      scanned += 1;
      return;
    }
    scanned += 1;
    if (usd > 0) priced += 1;
    if (wasFlagged === true) flagged += 1;
  });

  // 5. Accumulate counters on the run row. We add to whatever's already there
  //    so self-chained continuations show the full sweep total.
  const { data: current } = await supabase
    .from('price_check_runs')
    .select('scanned_count, priced_count, flagged_count')
    .eq('id', runId)
    .single();
  const totalScanned = (Number(current?.scanned_count) || 0) + scanned;
  const totalPriced = (Number(current?.priced_count) || 0) + priced;
  const totalFlagged = (Number(current?.flagged_count) || 0) + flagged;

  // 6. If a full batch came back AND not everyone was already-checked in this
  //    run, self-chain. The simplest heuristic: if the batch was full, more
  //    likely remain. Stop when the batch is shorter than batch_size.
  const moreLikely = batch.length === batchSize;

  if (moreLikely) {
    // Update counters but don't mark finished yet.
    await supabase
      .from('price_check_runs')
      .update({
        scanned_count: totalScanned,
        priced_count: totalPriced,
        flagged_count: totalFlagged,
      })
      .eq('id', runId);

    // Self-chain. Fire-and-forget — if the chained call dies, the run row
    // stays without finished_at and the next weekly cron starts fresh.
    try {
      await fetch(req.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(req.headers.get('Authorization')
            ? { Authorization: req.headers.get('Authorization')! }
            : {}),
        },
        body: JSON.stringify({ trigger, run_id: runId, batch_size: batchSize }),
      });
    } catch (e) {
      console.warn('[price-check] self-chain failed', e);
    }

    return jsonResponse({
      ok: true,
      run_id: runId,
      batch_scanned: scanned,
      batch_flagged: flagged,
      continuing: true,
    });
  }

  // 7. Finalize.
  await supabase.rpc('admin_price_review_finish', {
    p_run_id: runId,
    p_scanned: totalScanned,
    p_priced: totalPriced,
    p_flagged: totalFlagged,
    p_error: null,
  });

  return jsonResponse({
    ok: true,
    run_id: runId,
    scanned: totalScanned,
    priced: totalPriced,
    flagged: totalFlagged,
    continuing: false,
  });
});
