// Supabase Edge Function: send-auction-result
//
// POST { product_id: string }
//
// Fires from the auctions `auctions_notify_result` trigger via pg_net when an
// auction closes with a winner (winner_order_id transitions — the initial
// close AND an admin reassignment both qualify). Reads the auction + product +
// winner order via the service role and emails the winner their payment
// instructions (their bid became a normal order), plus an admin summary.
// Finally stamps auctions.notified_at. Void closes (no bids) only notify the
// admin.
//
// Required env vars (Supabase dashboard → Project Settings → Functions):
//   RESEND_API_KEY     — Resend API key
//   MAIL_FROM_ADDRESS  — e.g. "pedidos@poke-singles.com"
//   MAIL_FROM_NAME     — e.g. "Poke-Singles"
//   STORE_PUBLIC_URL   — e.g. "https://new.poke-singles.com"
//   SUPABASE_URL       — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected
//
// `verify_jwt = false` in supabase/config.toml: the trigger calls the function
// via pg_net without a session JWT.

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

function parseRecipients(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0 && EMAIL_RE.test(s));
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

interface Settings {
  sinpe_phone: string | null;
  bank_account_info: string | null;
  whatsapp_number: string | null;
  order_notification_recipients: string | null;
}

function paymentInstructions(args: {
  settings: Settings;
  orderNumber: number;
  amount: number;
}): string {
  const sinpe = args.settings.sinpe_phone ? escapeHtml(args.settings.sinpe_phone) : null;
  const bank = args.settings.bank_account_info
    ? escapeHtml(args.settings.bank_account_info).replace(/\n/g, '<br/>')
    : null;
  const wa = args.settings.whatsapp_number
    ? args.settings.whatsapp_number.replace(/\D/g, '')
    : null;
  const ref = `#${args.orderNumber}`;
  const waText = encodeURIComponent(
    `Hola, envío comprobante del pedido ${ref} (${fmtCRC(args.amount)}) — subasta ganada.`,
  );
  const waLink = wa ? `https://wa.me/${wa}?text=${waText}` : null;

  let body = `<p style="margin:0 0 12px;"><strong>Total a pagar: ${fmtCRC(args.amount)}</strong></p>`;
  if (sinpe) body += `<p style="margin:0 0 8px;"><strong>SINPE Móvil:</strong> ${sinpe}</p>`;
  if (bank) body += `<div style="margin:0 0 8px;"><strong>Transferencia bancaria:</strong><br/>${bank}</div>`;
  body += `<p style="margin:12px 0 0;">Cuando completes el pago, envíanos el comprobante`;
  if (waLink) body += ` por <a href="${waLink}" style="color:#1E3A8A;">WhatsApp</a>`;
  body += `.</p>`;
  return body;
}

function winnerHtml(args: {
  storeUrl: string;
  name: string;
  productName: string;
  imageUrl: string | null;
  amount: number;
  orderNumber: number;
  settings: Settings;
}): string {
  const img = args.imageUrl
    ? `<div style="text-align:center;margin:0 0 16px;">
         <img src="${args.imageUrl}" alt="${escapeHtml(args.productName)}" width="180"
              style="max-width:180px;height:auto;border-radius:6px;border:1px solid #e5e7eb;" />
       </div>`
    : '';
  return shell(
    args.storeUrl,
    '🏆 ¡Ganaste la subasta!',
    '#1E3A8A',
    `<p style="margin:0 0 12px;">Felicidades ${escapeHtml(args.name)}, tu puja de
       <strong>${fmtCRC(args.amount)}</strong> ganó la subasta de
       <strong>${escapeHtml(args.productName)}</strong>.</p>
     ${img}
     <p style="margin:0 0 16px;">Generamos tu pedido
       <strong style="font-family:'IBM Plex Mono',monospace;">#${args.orderNumber}</strong>
       por el monto de tu puja. Para asegurar la carta, completá el pago:</p>
     <div style="font-size:14px;line-height:1.5;background:#FAF7F2;border-radius:8px;padding:14px 16px;">
       ${paymentInstructions({ settings: args.settings, orderNumber: args.orderNumber, amount: args.amount })}
     </div>
     <p style="margin:16px 0 0;color:#6b7280;font-size:13px;">
       Recordá que al pujar te comprometiste a pagar. Si no recibimos el pago,
       la carta podría ofrecerse al siguiente postor y tu cuenta quedar vetada
       de futuras subastas.</p>
     <p style="margin:16px 0 0;font-size:12px;color:#6b7280;">Si tenés alguna pregunta, simplemente respondé este correo.</p>`,
  );
}

function adminHtml(args: {
  storeUrl: string;
  productName: string;
  winnerName: string | null;
  winnerEmail: string | null;
  amount: number | null;
  orderNumber: number | null;
  orderId: string | null;
  bidCount: number;
}): string {
  const adminLink = args.orderId
    ? `${args.storeUrl.replace(/\/$/, '')}/admin/orders/${args.orderId}`
    : null;
  const body = args.winnerName
    ? `<table style="width:100%;border-collapse:collapse;font-size:14px;">
         <tr><td style="padding:6px 0;color:#6b7280;width:140px;">Ganador</td><td style="padding:6px 0;"><strong>${escapeHtml(args.winnerName)}</strong></td></tr>
         <tr><td style="padding:6px 0;color:#6b7280;">Email</td><td style="padding:6px 0;">${escapeHtml(args.winnerEmail ?? '')}</td></tr>
         <tr><td style="padding:6px 0;color:#6b7280;">Puja ganadora</td><td style="padding:6px 0;"><strong>${args.amount != null ? fmtCRC(args.amount) : '—'}</strong></td></tr>
         <tr><td style="padding:6px 0;color:#6b7280;">Pujas totales</td><td style="padding:6px 0;">${args.bidCount}</td></tr>
         <tr><td style="padding:6px 0;color:#6b7280;">Pedido</td><td style="padding:6px 0;">${
           args.orderNumber != null
             ? `<strong>#${args.orderNumber}</strong>${adminLink ? ` — <a href="${adminLink}" style="color:#1E3A8A;">ver en admin</a>` : ''}`
             : '—'
         }</td></tr>
       </table>`
    : `<p style="margin:0;color:#6b7280;">La subasta cerró sin pujas elegibles.</p>`;
  return shell(args.storeUrl, `Subasta cerrada — ${escapeHtml(args.productName)}`, '#1E3A8A', body);
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
    .select('status, winner_name, winner_email, winner_order_id, current_bid, bid_count')
    .eq('product_id', productId)
    .maybeSingle();
  if (auctionErr) return jsonResponse({ ok: false, error: 'AUCTION_READ', detail: auctionErr.message }, 500);
  if (!auction) return jsonResponse({ ok: false, error: 'AUCTION_NOT_FOUND' }, 404);
  if (auction.status !== 'ended' && auction.status !== 'void') {
    return jsonResponse({ ok: true, skipped: 'not_closed' });
  }

  const { data: product } = await supabase
    .from('products')
    .select('name, image_url')
    .eq('id', productId)
    .maybeSingle();
  const productName = (product?.name as string | undefined) ?? 'Subasta';
  // Only absolute image URLs render in email clients; self-hosted relative
  // paths get prefixed with the store origin.
  const rawImage = (product?.image_url as string | null | undefined) ?? null;
  const imageUrl = rawImage
    ? rawImage.startsWith('http')
      ? rawImage
      : `${storeUrl.replace(/\/$/, '')}/${rawImage.replace(/^\//, '')}`
    : null;

  const { data: settingsRow } = await supabase
    .from('app_settings')
    .select('sinpe_phone, bank_account_info, whatsapp_number, order_notification_recipients')
    .eq('id', true)
    .single();
  const settings = (settingsRow ?? {
    sinpe_phone: null,
    bank_account_info: null,
    whatsapp_number: null,
    order_notification_recipients: null,
  }) as Settings;
  const adminRecipients = parseRecipients(settings.order_notification_recipients);

  const from = `${fromName} <${fromAddress}>`;
  let sent = 0;

  let orderNumber: number | null = null;
  if (auction.winner_order_id) {
    const { data: order } = await supabase
      .from('orders')
      .select('order_number')
      .eq('id', auction.winner_order_id)
      .maybeSingle();
    orderNumber = (order?.order_number as number | undefined) ?? null;
  }

  if (auction.status === 'ended' && auction.winner_email && EMAIL_RE.test(auction.winner_email) && orderNumber != null) {
    const r = await sendResend({
      apiKey: resendKey,
      from,
      to: [auction.winner_email],
      subject: `🏆 ¡Ganaste la subasta! — ${productName}`,
      html: winnerHtml({
        storeUrl,
        name: auction.winner_name ?? 'coleccionista',
        productName,
        imageUrl,
        amount: Number(auction.current_bid ?? 0),
        orderNumber,
        settings,
      }),
    });
    if (r.ok) sent++;
  }

  if (adminRecipients.length > 0) {
    const r = await sendResend({
      apiKey: resendKey,
      from,
      to: adminRecipients,
      subject:
        auction.status === 'ended'
          ? `Subasta cerrada — ${productName}`
          : `Subasta sin pujas — ${productName}`,
      html: adminHtml({
        storeUrl,
        productName,
        winnerName: auction.status === 'ended' ? auction.winner_name : null,
        winnerEmail: auction.status === 'ended' ? auction.winner_email : null,
        amount: auction.current_bid != null ? Number(auction.current_bid) : null,
        orderNumber,
        orderId: auction.winner_order_id,
        bidCount: (auction.bid_count as number) ?? 0,
      }),
    });
    if (r.ok) sent++;
  }

  await supabase
    .from('auctions')
    .update({ notified_at: new Date().toISOString() })
    .eq('product_id', productId);
  return jsonResponse({ ok: true, status: auction.status, sent });
});
