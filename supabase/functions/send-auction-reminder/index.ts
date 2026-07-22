// Supabase Edge Function: send-auction-reminder
//
// POST { product_id: string }
//
// Fires from process_auctions() (pg_cron, every minute) via pg_net when an
// auction with bids enters its final 30 minutes — reminder_sent_at is stamped
// BEFORE dispatch, so this sends at most once per auction (per relist).
// Emails every distinct live bidder: current bid, closing time (Costa Rica),
// and a link back to the auction.
//
// Required env vars (Supabase dashboard → Project Settings → Functions):
//   RESEND_API_KEY     — Resend API key
//   MAIL_FROM_ADDRESS  — e.g. "pedidos@poke-singles.com"
//   MAIL_FROM_NAME     — e.g. "Poke-Singles"
//   STORE_PUBLIC_URL   — e.g. "https://new.poke-singles.com"
//   SUPABASE_URL       — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected
//
// `verify_jwt = false` in supabase/config.toml: pg_net calls without a session.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const LOGO_URL = 'https://poke-singles.com/logo.png';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtCRC(n: number): string {
  return `₡${Math.round(n).toLocaleString('es-CR')}`;
}

/** Closing time formatted for Costa Rica (UTC-6, no DST). */
function fmtCloseCR(iso: string): string {
  return new Intl.DateTimeFormat('es-CR', {
    timeZone: 'America/Costa_Rica',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function shell(storeUrl: string, heading: string, headingColor: string, inner: string): string {
  return `
<!doctype html>
<html lang="es">
<body style="font-family:Manrope,Arial,sans-serif;background:#FAF7F2;color:#1f2937;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;border:1px solid #e5e7eb;">
    <a href="${storeUrl}" style="display:block;text-align:left;text-decoration:none;margin-bottom:12px;">
      <img src="${LOGO_URL}" alt="Poke-Singles" width="120"
           style="display:inline-block;max-width:120px;height:auto;border:0;outline:none;text-decoration:none;" />
    </a>
    <div style="height:3px;background:linear-gradient(90deg,#CE1126 0%,#1E3A8A 100%);border-radius:2px;margin-bottom:20px;"></div>
    <h1 style="margin:0 0 12px;font-size:20px;color:${headingColor};">${heading}</h1>
    ${inner}
  </div>
</body>
</html>`;
}

function reminderHtml(args: {
  storeUrl: string;
  name: string;
  productName: string;
  currentBid: number;
  endsAt: string;
  auctionUrl: string;
  isLeading: boolean;
}): string {
  const position = args.isLeading
    ? `<p style="margin:0 0 12px;color:#15803d;"><strong>Vas ganando</strong> — mantené el ojo por si alguien puja de último minuto.</p>`
    : `<p style="margin:0 0 12px;color:#b45309;"><strong>Alguien superó tu puja.</strong> Todavía estás a tiempo de recuperarla.</p>`;
  return shell(
    args.storeUrl,
    '⏰ La subasta cierra pronto',
    '#1E3A8A',
    `<p style="margin:0 0 12px;">Hola ${escapeHtml(args.name)}, la subasta de
       <strong>${escapeHtml(args.productName)}</strong> cierra en menos de 30 minutos
       (${escapeHtml(fmtCloseCR(args.endsAt))}).</p>
     ${position}
     <p style="margin:0 0 16px;">Puja actual: <strong>${fmtCRC(args.currentBid)}</strong></p>
     <p style="margin:0;">
       <a href="${args.auctionUrl}"
          style="display:inline-block;background:#1E3A8A;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;">
         Ver la subasta
       </a>
     </p>`,
  );
}

async function sendResend(args: {
  apiKey: string;
  from: string;
  to: string[];
  subject: string;
  html: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: args.from,
      to: args.to,
      subject: args.subject,
      html: args.html,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Resend ${res.status}: ${text}` };
  }
  const data = await res.json();
  return { ok: true, id: data.id ?? '' };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);

  let body: { product_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'INVALID_JSON' }, 400);
  }
  const productId = (body.product_id ?? '').trim();
  if (!productId) return jsonResponse({ ok: false, error: 'MISSING_PRODUCT_ID' }, 400);

  const supaUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supaKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const resendKey = Deno.env.get('RESEND_API_KEY') ?? '';
  const fromAddress = Deno.env.get('MAIL_FROM_ADDRESS') ?? '';
  const fromName = Deno.env.get('MAIL_FROM_NAME') ?? 'Poke-Singles';
  const storeUrl = Deno.env.get('STORE_PUBLIC_URL') ?? 'https://new.poke-singles.com';

  if (!supaUrl || !supaKey) return jsonResponse({ ok: false, error: 'SERVER_MISCONFIGURED' }, 500);
  if (!resendKey || !fromAddress) return jsonResponse({ ok: false, error: 'MAIL_NOT_CONFIGURED' }, 500);

  const supabase = createClient(supaUrl, supaKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auction, error: auctionErr } = await supabase
    .from('auctions')
    .select('status, ends_at, current_bid, leader_user_id')
    .eq('product_id', productId)
    .maybeSingle();
  if (auctionErr) return jsonResponse({ ok: false, error: 'AUCTION_READ', detail: auctionErr.message }, 500);
  if (!auction) return jsonResponse({ ok: false, error: 'AUCTION_NOT_FOUND' }, 404);
  if (auction.status !== 'active' || !auction.ends_at) {
    return jsonResponse({ ok: true, skipped: 'not_active' });
  }

  const { data: product } = await supabase
    .from('products')
    .select('name, slug')
    .eq('id', productId)
    .maybeSingle();
  const productName = (product?.name as string | undefined) ?? 'Subasta';
  const auctionUrl = `${storeUrl.replace(/\/$/, '')}/subastas/${product?.slug ?? ''}`;

  // Distinct live bidders (latest name wins per email).
  const { data: bidRows, error: bidsErr } = await supabase
    .from('bids')
    .select('user_id, bidder_name, bidder_email')
    .eq('product_id', productId)
    .is('invalidated_at', null)
    .order('created_at', { ascending: false });
  if (bidsErr) return jsonResponse({ ok: false, error: 'BIDS_READ', detail: bidsErr.message }, 500);

  const byEmail = new Map<string, { name: string; email: string; userId: string | null }>();
  for (const row of (bidRows ?? []) as any[]) {
    const email = String(row.bidder_email ?? '').trim();
    if (!EMAIL_RE.test(email)) continue;
    const key = email.toLowerCase();
    if (!byEmail.has(key)) {
      byEmail.set(key, { name: row.bidder_name ?? '', email, userId: row.user_id ?? null });
    }
  }

  const from = `${fromName} <${fromAddress}>`;
  let sent = 0;
  for (const bidder of byEmail.values()) {
    const r = await sendResend({
      apiKey: resendKey,
      from,
      to: [bidder.email],
      subject: `⏰ Cierra pronto — ${productName}`,
      html: reminderHtml({
        storeUrl,
        name: bidder.name || 'coleccionista',
        productName,
        currentBid: Number(auction.current_bid ?? 0),
        endsAt: auction.ends_at as string,
        auctionUrl,
        isLeading: bidder.userId != null && bidder.userId === auction.leader_user_id,
      }),
    });
    if (r.ok) sent++;
  }

  return jsonResponse({ ok: true, bidders: byEmail.size, sent });
});
