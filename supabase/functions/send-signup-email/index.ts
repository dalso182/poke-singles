// Supabase Edge Function: send-signup-email
//
// POST { user_id: string }
//
// Fires from the handle_new_user() trigger via pg_net on every auth.users
// INSERT. Reads the user + profile via the service role, looks up admin
// recipients from app_settings.order_notification_recipients, and sends a
// single notification email through Resend listing all admin recipients in
// the to[] array.
//
// Required env vars (Supabase dashboard → Project Settings → Functions):
//   RESEND_API_KEY     — Resend API key
//   MAIL_FROM_ADDRESS  — e.g. "pedidos@poke-singles.com"
//   MAIL_FROM_NAME     — e.g. "Poke-Singles"
//   STORE_PUBLIC_URL   — e.g. "https://new.poke-singles.com"
//   SUPABASE_URL       — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected
//
// `verify_jwt = false` in supabase/config.toml: the trigger calls the
// function via pg_net without a session JWT.

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

function parseRecipients(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0 && EMAIL_RE.test(s));
}

function providerLabel(rawAppMeta: any): string {
  const provider = (rawAppMeta?.provider as string | undefined) ?? '';
  switch (provider) {
    case 'email':    return 'Email / Magic link';
    case 'google':   return 'Google';
    case 'github':   return 'GitHub';
    case 'phone':    return 'Teléfono';
    default:         return provider || 'Desconocido';
  }
}

function adminHtml(args: {
  email: string;
  fullName: string | null;
  phone: string | null;
  provider: string;
  storeUrl: string;
}): string {
  const adminLink = `${args.storeUrl.replace(/\/$/, '')}/admin`;
  const name = args.fullName ? escapeHtml(args.fullName) : '<em>(sin nombre)</em>';
  return `
<!doctype html>
<html lang="es">
<body style="font-family:Manrope,Arial,sans-serif;background:#FAF7F2;color:#1f2937;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;border:1px solid #e5e7eb;">
    <a href="${args.storeUrl}" style="display:block;text-align:left;text-decoration:none;margin-bottom:12px;">
      <img src="${LOGO_URL}" alt="Poke-Singles" width="120"
           style="display:inline-block;max-width:120px;height:auto;border:0;outline:none;text-decoration:none;" />
    </a>
    <div style="height:3px;background:linear-gradient(90deg,#CE1126 0%,#1E3A8A 100%);border-radius:2px;margin-bottom:20px;"></div>

    <h1 style="margin:0 0 4px;font-size:20px;color:#1E3A8A;">Nuevo registro</h1>
    <p style="margin:0 0 16px;color:#6b7280;">Un cliente acaba de crear su cuenta.</p>

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
      <tr><td style="padding:6px 0;color:#6b7280;width:120px;">Nombre</td><td style="padding:6px 0;"><strong>${name}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Email</td><td style="padding:6px 0;">${escapeHtml(args.email)}</td></tr>
      ${args.phone ? `<tr><td style="padding:6px 0;color:#6b7280;">Teléfono</td><td style="padding:6px 0;">${escapeHtml(args.phone)}</td></tr>` : ''}
      <tr><td style="padding:6px 0;color:#6b7280;">Método</td><td style="padding:6px 0;">${escapeHtml(args.provider)}</td></tr>
    </table>

    <a href="${adminLink}" style="display:inline-block;background:#1E3A8A;color:#fff;text-decoration:none;padding:10px 20px;border-radius:4px;font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Abrir admin</a>
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

  let body: { user_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'INVALID_JSON' }, 400);
  }
  const userId = (body.user_id ?? '').trim();
  if (!userId) {
    return jsonResponse({ ok: false, error: 'MISSING_USER_ID' }, 400);
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

  // Pull the user via the auth admin API (auth.users isn't directly queryable).
  const { data: userRes, error: userErr } = await supabase.auth.admin.getUserById(userId);
  if (userErr || !userRes?.user) {
    return jsonResponse({ ok: false, error: 'USER_NOT_FOUND', detail: userErr?.message }, 404);
  }
  const user = userRes.user;

  // Profile (created by handle_new_user just before this fires).
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, phone')
    .eq('id', userId)
    .maybeSingle();

  // Recipients — bail early if none configured.
  const { data: settings, error: settingsErr } = await supabase
    .from('app_settings')
    .select('order_notification_recipients')
    .eq('id', true)
    .single();
  if (settingsErr) {
    return jsonResponse({ ok: false, error: 'SETTINGS_READ', detail: settingsErr.message }, 500);
  }
  const recipients = parseRecipients(settings?.order_notification_recipients ?? null);
  if (recipients.length === 0) {
    return jsonResponse({ ok: true, sent: 0 });
  }

  const fullName =
    (profile?.full_name as string | undefined) ??
    (user.user_metadata?.['full_name'] as string | undefined) ??
    (user.user_metadata?.['name'] as string | undefined) ??
    null;
  const phone = (profile?.phone as string | undefined) ?? null;
  const provider = providerLabel(user.app_metadata);

  const result = await sendResend({
    apiKey: resendKey,
    from: `${fromName} <${fromAddress}>`,
    to: recipients,
    subject: `Nuevo cliente — ${user.email ?? userId}`,
    html: adminHtml({
      email: user.email ?? '',
      fullName,
      phone,
      provider,
      storeUrl,
    }),
  });

  if (!result.ok) {
    return jsonResponse({ ok: false, error: 'RESEND_FAILED', detail: result.error }, 502);
  }
  return jsonResponse({ ok: true, sent: recipients.length, id: result.id });
});
