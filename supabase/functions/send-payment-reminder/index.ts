// Supabase Edge Function: send-payment-reminder
//
// POST { order_id: string }
//
// Admin-triggered "Recordar pago": re-sends payment instructions for a
// pending order to its customer via Resend, with a CTA to the order's
// confirmation page (payment instructions + proof upload) and a secondary
// link to /account/pedidos. On success stamps orders.payment_reminder_at.
//
// Required env vars (set in Supabase dashboard → Project Settings → Functions):
//   RESEND_API_KEY     — Resend API key
//   MAIL_FROM_ADDRESS  — e.g. "pedidos@poke-singles.com"
//   MAIL_FROM_NAME     — e.g. "Poke-Singles"
//   STORE_PUBLIC_URL   — e.g. "https://new.poke-singles.com"
//   SUPABASE_URL       — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected
//
// `verify_jwt = true` in supabase/config.toml: the gateway requires a valid
// JWT, but the anon key is itself a valid JWT — the real gate is the
// in-function check that the caller's app_metadata.role is 'admin' (the same
// claim public.is_admin() reads). Business failures return HTTP 200 with
// { ok: false, error: CODE } so supabase-js surfaces the code in `data`.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const LOGO_URL = 'https://www.poke-singles.com/logo.png';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface OrderRow {
  id: string;
  order_number: number;
  status: string;
  customer_email: string;
  customer_name: string;
  customer_phone: string;
  shipping_address: any;
  shipping_method_name: string;
  shipping_amount: number;
  payment_method: 'sinpe_or_transfer' | 'payment_link';
  subtotal: number;
  discount_amount: number;
  coupon_code: string | null;
  total: number;
  created_at: string;
}

interface OrderItem {
  id: string;
  product_name: string;
  product_image_url: string | null;
  product_set_name: string | null;
  product_card_number: string | null;
  product_condition: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
}

interface AppSettings {
  sinpe_phone: string | null;
  whatsapp_number: string | null;
  bank_account_info: string | null;
}

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

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-CR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function renderItemsRows(items: OrderItem[]): string {
  return items
    .map((it) => {
      const name = escapeHtml(it.product_name);
      const setBits: string[] = [];
      if (it.product_set_name) setBits.push(escapeHtml(it.product_set_name));
      if (it.product_card_number) setBits.push(`#${escapeHtml(it.product_card_number)}`);
      const subline = setBits.join(' · ');
      const cond = it.product_condition ? ` · ${escapeHtml(it.product_condition)}` : '';
      return `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;">
            <div style="font-weight:600;color:#1f2937;">${name}</div>
            ${subline ? `<div style="font-size:12px;color:#6b7280;">${subline}${cond}</div>` : ''}
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center;color:#6b7280;">×${it.quantity}</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${fmtCRC(it.line_total)}</td>
        </tr>`;
    })
    .join('');
}

function renderPaymentInstructions(order: OrderRow, settings: AppSettings): string {
  if (order.payment_method !== 'sinpe_or_transfer') {
    return `
      <p style="margin:0 0 8px;">
        En breve te enviaremos el enlace de pago.
      </p>`;
  }
  const sinpe = settings.sinpe_phone ? escapeHtml(settings.sinpe_phone) : null;
  const bank = settings.bank_account_info ? escapeHtml(settings.bank_account_info).replace(/\n/g, '<br/>') : null;
  const wa = settings.whatsapp_number ? settings.whatsapp_number.replace(/\D/g, '') : null;
  const ref = `#${order.order_number}`;
  const waText = encodeURIComponent(`Hola, envío comprobante del pedido ${ref} (${fmtCRC(order.total)}).`);
  const waLink = wa ? `https://wa.me/${wa}?text=${waText}` : null;

  let body = `<p style="margin:0 0 12px;"><strong>Total a pagar: ${fmtCRC(order.total)}</strong></p>`;
  if (sinpe) {
    body += `<p style="margin:0 0 8px;"><strong>SINPE Móvil:</strong> ${sinpe}</p>`;
  }
  if (bank) {
    body += `<div style="margin:0 0 8px;"><strong>Transferencia bancaria:</strong><br/>${bank}</div>`;
  }
  body += `<p style="margin:12px 0 0;">Cuando completes el pago, envíanos el comprobante`;
  if (waLink) {
    body += ` por <a href="${waLink}" style="color:#1E3A8A;">WhatsApp</a>`;
  }
  body += `.</p>`;
  return body;
}

function reminderHtml(order: OrderRow, items: OrderItem[], settings: AppSettings, storeUrl: string): string {
  const base = storeUrl.replace(/\/$/, '');
  const ref = `#${order.order_number}`;
  const ctaUrl = `${base}/checkout/confirmation/${order.id}?email=${encodeURIComponent(order.customer_email)}`;
  const ordersUrl = `${base}/account/pedidos`;
  return `
<!doctype html>
<html lang="es">
<body style="font-family:Manrope,Arial,sans-serif;background:#FAF7F2;color:#1f2937;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;border:1px solid #e5e7eb;">
    <a href="${base}" style="display:block;text-align:center;text-decoration:none;margin-bottom:16px;">
      <img src="${LOGO_URL}" alt="Poke-Singles" width="160"
           style="display:inline-block;max-width:160px;height:auto;border:0;outline:none;text-decoration:none;" />
    </a>
    <div style="height:3px;background:linear-gradient(90deg,#CE1126 0%,#1E3A8A 100%);border-radius:2px;margin-bottom:24px;"></div>
    <h1 style="margin:0 0 4px;font-size:22px;color:#1E3A8A;">Hola, ${escapeHtml(order.customer_name)}</h1>
    <p style="margin:0 0 24px;color:#6b7280;">Tu pedido <strong style="font-family:'IBM Plex Mono',monospace;">${ref}</strong> del ${fmtDate(order.created_at)} sigue pendiente de pago.</p>

    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:6px;">Instrucciones de pago</h2>
    <div style="margin:12px 0 0;font-size:14px;line-height:1.5;">${renderPaymentInstructions(order, settings)}</div>

    <div style="text-align:center;margin:24px 0;">
      <a href="${ctaUrl}" style="display:inline-block;background:#1E3A8A;color:#fff;text-decoration:none;padding:12px 24px;border-radius:4px;font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Completar pago y subir comprobante</a>
    </div>

    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:6px;margin-top:24px;">Resumen</h2>
    <table style="width:100%;border-collapse:collapse;margin:8px 0 16px;">
      ${renderItemsRows(items)}
    </table>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:4px 0;color:#6b7280;">Subtotal</td><td style="padding:4px 0;text-align:right;">${fmtCRC(order.subtotal)}</td></tr>
      ${order.discount_amount > 0 ? `<tr><td style="padding:4px 0;color:#CE1126;">${escapeHtml(order.coupon_code ?? 'Descuento')}</td><td style="padding:4px 0;text-align:right;color:#CE1126;">−${fmtCRC(order.discount_amount)}</td></tr>` : ''}
      <tr><td style="padding:4px 0;color:#6b7280;">Envío (${escapeHtml(order.shipping_method_name)})</td><td style="padding:4px 0;text-align:right;">${fmtCRC(order.shipping_amount)}</td></tr>
      <tr><td style="padding:8px 0 0;font-weight:700;border-top:1px solid #e5e7eb;">Total</td><td style="padding:8px 0 0;text-align:right;font-weight:700;font-size:18px;border-top:1px solid #e5e7eb;">${fmtCRC(order.total)}</td></tr>
    </table>

    <p style="margin:24px 0 0;font-size:14px;">También podés ver tus pedidos en <a href="${ordersUrl}" style="color:#1E3A8A;">mi cuenta</a>.</p>

    <p style="margin:32px 0 0;font-size:12px;color:#6b7280;">Si ya realizaste el pago, ignorá este correo o respondé con tu comprobante.</p>
  </div>
</body>
</html>`;
}

async function sendResend(args: {
  apiKey: string;
  from: string;
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
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
      reply_to: args.replyTo,
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

  let body: { order_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'INVALID_JSON' }, 400);
  }
  const orderId = (body.order_id ?? '').trim();
  if (!orderId) {
    return jsonResponse({ ok: false, error: 'MISSING_FIELDS' }, 400);
  }

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

  // Admin gate: the caller's JWT must belong to a user whose
  // app_metadata.role is 'admin' — the same claim public.is_admin() reads.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || userData?.user?.app_metadata?.role !== 'admin') {
    return jsonResponse({ ok: false, error: 'NOT_ADMIN' });
  }

  const { data: orderRow, error: orderErr } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', orderId)
    .maybeSingle();
  if (orderErr) return jsonResponse({ ok: false, error: 'DB_ERROR', detail: orderErr.message }, 500);
  if (!orderRow) return jsonResponse({ ok: false, error: 'NOT_FOUND' });

  const { order_items, ...order } = orderRow as OrderRow & { order_items: OrderItem[] };
  const items = order_items ?? [];

  if (order.status !== 'pending') {
    return jsonResponse({ ok: false, error: 'NOT_PENDING' });
  }

  const { data: settingsRow, error: settingsErr } = await supabase
    .from('app_settings')
    .select('sinpe_phone, whatsapp_number, bank_account_info')
    .eq('id', true)
    .single();
  if (settingsErr) return jsonResponse({ ok: false, error: 'DB_ERROR', detail: settingsErr.message }, 500);
  const settings = settingsRow as AppSettings;

  const sent = await sendResend({
    apiKey: resendKey,
    from: `${fromName} <${fromAddress}>`,
    to: [order.customer_email],
    subject: `Recordatorio: pago pendiente del pedido #${order.order_number} — Poke-Singles`,
    html: reminderHtml(order, items, settings, storeUrl),
    replyTo: fromAddress,
  });
  if (!sent.ok) {
    console.error('[send-payment-reminder]', sent.error);
    return jsonResponse({ ok: false, error: 'SEND_FAILED' });
  }

  // Best-effort stamp — the email already went out, so a tracking-write
  // failure must not report the send as failed.
  const reminderAt = new Date().toISOString();
  const { error: stampErr } = await supabase
    .from('orders')
    .update({ payment_reminder_at: reminderAt })
    .eq('id', orderId);
  if (stampErr) console.error('[send-payment-reminder] stamp failed:', stampErr.message);

  return jsonResponse({ ok: true, reminder_at: reminderAt });
});
