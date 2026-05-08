-- Payment-instructions display fields. Shown verbatim on the order
-- confirmation page when payment_method = 'sinpe_or_transfer'. Admin
-- edits from /admin/config.

alter table public.app_settings
  add column sinpe_phone        text,
  add column whatsapp_number    text,
  add column bank_account_info  text;
