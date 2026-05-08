-- Comma-separated list of email addresses that receive an admin notification
-- whenever a customer places an order. Edited from /admin/config. Empty
-- string = no admin notifications fire (the customer email still does).
-- Garbage entries are dropped server-side by the send-order-email function.

alter table public.app_settings
  add column order_notification_recipients text default '' not null;
