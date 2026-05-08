-- Admin upload path for the payment-proofs bucket.
--
-- The original customer-upload policy (`payment_proofs_upload_pending_order`)
-- only lets customers attach a file while the order is still 'pending' AND
-- the payment method is sinpe_or_transfer. That's correct for the customer
-- flow, but blocks the operational case where the customer paid via
-- WhatsApp, the admin received a screenshot out-of-band, and wants to
-- attach it for the audit trail — possibly after the order has already
-- been flipped to 'paid'. Add a blanket admin-all policy so the admin
-- can upload, replace, and delete proofs at any status.
--
-- Read access already exists via `payment_proofs_admin_read`; this
-- supersedes it but the older policy is kept for backward compat (RLS
-- combines policies with OR).

create policy "payment_proofs_admin_all"
  on storage.objects for all to authenticated
  using (bucket_id = 'payment-proofs' and public.is_admin())
  with check (bucket_id = 'payment-proofs' and public.is_admin());
