// Supabase Edge Function: send-raffle-result
//
// POST { product_id: string }
//
// Fires from the raffles `notify_raffle_result` trigger via pg_net when a raffle
// is drawn (status scheduled → drawn/void). Reads the raffle + product +
// participants via the service role and emails each participant individually
// through Resend (the winner gets a congrats variant), plus an admin summary.
// Finally stamps raffles.notified_at.
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
const LOGO_URL = 'https://www.poke-singles.com/logo.png';
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

function winnerHtml(args: { storeUrl: string; name: string; raffle: string }): string {
  return shell(
    args.storeUrl,
    '🎉 ¡Ganaste la rifa!',
    '#1E3A8A',
    `<p style="margin:0 0 12px;">Felicidades ${escapeHtml(args.name)}, tu participación resultó
       <strong>ganadora</strong> en la rifa <strong>${escapeHtml(args.raffle)}</strong>.</p>
     <p style="margin:0;color:#6b7280;">Nos pondremos en contacto para coordinar la entrega del premio. ¡Gracias por participar!</p>`,
  );
}

function participantHtml(args: {
  storeUrl: string;
  name: string;
  raffle: string;
  winner: string;
}): string {
  return shell(
    args.storeUrl,
    'Resultado de la rifa',
    '#1E3A8A',
    `<p style="margin:0 0 12px;">Hola ${escapeHtml(args.name)}, la rifa
       <strong>${escapeHtml(args.raffle)}</strong> ya tiene ganador:
       <strong>${escapeHtml(args.winner)}</strong>.</p>
     <p style="margin:0;color:#6b7280;">¡Gracias por participar! Pronto tendremos más rifas.</p>`,
  );
}

function adminHtml(args: {
  storeUrl: string;
  raffle: string;
  winner: string | null;
  totalEntries: number;
  participantCount: number;
}): string {
  const body = args.winner
    ? `<table style="width:100%;border-collapse:collapse;font-size:14px;">
         <tr><td style="padding:6px 0;color:#6b7280;width:140px;">Ganador</td><td style="padding:6px 0;"><strong>${escapeHtml(args.winner)}</strong></td></tr>
         <tr><td style="padding:6px 0;color:#6b7280;">Entradas totales</td><td style="padding:6px 0;">${args.totalEntries}</td></tr>
         <tr><td style="padding:6px 0;color:#6b7280;">Participantes</td><td style="padding:6px 0;">${args.participantCount}</td></tr>
       </table>`
    : `<p style="margin:0;color:#6b7280;">La rifa se cerró sin participantes.</p>`;
  return shell(args.storeUrl, `Rifa sorteada — ${escapeHtml(args.raffle)}`, '#1E3A8A', body);
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

  const { data: raffle, error: raffleErr } = await supabase
    .from('raffles')
    .select('status, winner_name, winner_email, total_entries')
    .eq('product_id', productId)
    .maybeSingle();
  if (raffleErr) return jsonResponse({ ok: false, error: 'RAFFLE_READ', detail: raffleErr.message }, 500);
  if (!raffle) return jsonResponse({ ok: false, error: 'RAFFLE_NOT_FOUND' }, 404);
  if (raffle.status !== 'drawn' && raffle.status !== 'void') {
    return jsonResponse({ ok: true, skipped: 'not_drawn' });
  }

  const { data: product } = await supabase
    .from('products')
    .select('name')
    .eq('id', productId)
    .maybeSingle();
  const raffleName = (product?.name as string | undefined) ?? 'Rifa';

  const from = `${fromName} <${fromAddress}>`;
  const adminRecipients = await supabase
    .from('app_settings')
    .select('order_notification_recipients')
    .eq('id', true)
    .single()
    .then((r) => parseRecipients((r.data?.order_notification_recipients as string | null) ?? null));

  let sent = 0;

  if (raffle.status === 'void') {
    if (adminRecipients.length > 0) {
      const r = await sendResend({
        apiKey: resendKey, from, to: adminRecipients,
        subject: `Rifa sin participantes — ${raffleName}`,
        html: adminHtml({ storeUrl, raffle: raffleName, winner: null, totalEntries: 0, participantCount: 0 }),
      });
      if (r.ok) sent++;
    }
    await supabase.from('raffles').update({ notified_at: new Date().toISOString() }).eq('product_id', productId);
    return jsonResponse({ ok: true, status: 'void', sent });
  }

  // status === 'drawn' — collect distinct non-cancelled participants.
  const { data: rows, error: itemsErr } = await supabase
    .from('order_items')
    .select('orders(customer_name, customer_email, status)')
    .eq('product_id', productId);
  if (itemsErr) return jsonResponse({ ok: false, error: 'ITEMS_READ', detail: itemsErr.message }, 500);

  const byEmail = new Map<string, { name: string; email: string }>();
  for (const row of (rows ?? []) as any[]) {
    const o = row.orders;
    if (!o || o.status === 'cancelled') continue;
    const email = String(o.customer_email ?? '').trim();
    if (!EMAIL_RE.test(email)) continue;
    const key = email.toLowerCase();
    if (!byEmail.has(key)) byEmail.set(key, { name: o.customer_name ?? '', email });
  }

  const winnerEmail = (raffle.winner_email ?? '').toLowerCase();
  const winnerName = raffle.winner_name ?? '';

  for (const p of byEmail.values()) {
    const isWinner = p.email.toLowerCase() === winnerEmail;
    const r = await sendResend({
      apiKey: resendKey, from, to: [p.email],
      subject: isWinner ? `🎉 ¡Ganaste la rifa! — ${raffleName}` : `Resultado de la rifa — ${raffleName}`,
      html: isWinner
        ? winnerHtml({ storeUrl, name: p.name || 'participante', raffle: raffleName })
        : participantHtml({ storeUrl, name: p.name || 'participante', raffle: raffleName, winner: winnerName }),
    });
    if (r.ok) sent++;
  }

  if (adminRecipients.length > 0) {
    const r = await sendResend({
      apiKey: resendKey, from, to: adminRecipients,
      subject: `Rifa sorteada — ${raffleName}`,
      html: adminHtml({
        storeUrl, raffle: raffleName, winner: winnerName,
        totalEntries: (raffle.total_entries as number) ?? 0,
        participantCount: byEmail.size,
      }),
    });
    if (r.ok) sent++;
  }

  await supabase.from('raffles').update({ notified_at: new Date().toISOString() }).eq('product_id', productId);
  return jsonResponse({ ok: true, status: 'drawn', participants: byEmail.size, sent });
});
