-- "Recordar pago": timestamp of the last admin-triggered payment-reminder
-- email for a pending order. Written only by the send-payment-reminder edge
-- function (service role, bypasses RLS); admins read it via orders_admin_all.
alter table public.orders
  add column if not exists payment_reminder_at timestamptz;

comment on column public.orders.payment_reminder_at is
  'Last "Recordar pago" reminder email sent by an admin (stamped by the send-payment-reminder edge function). Null = never sent.';
