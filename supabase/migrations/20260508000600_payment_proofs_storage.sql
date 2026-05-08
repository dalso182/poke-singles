-- Storage bucket for SINPE/transfer payment proof screenshots. Not public —
-- only admins read; customers (anon or auth) can upload to a path scoped
-- to a real pending order. The Storage RLS predicate joins to orders.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do nothing;

-- Upload: anon or authenticated, but only if the path's first segment is
-- the id of a pending sinpe_or_transfer order. Customers should upload to
-- {order_id}/proof.{ext}.
create policy "payment_proofs_upload_pending_order"
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'payment-proofs'
    and exists (
      select 1 from public.orders o
      where o.id::text = split_part(name, '/', 1)
        and o.status = 'pending'
        and o.payment_method = 'sinpe_or_transfer'
    )
  );

-- Read: admins only. Customers don't need to view their own proof after
-- upload — the UI just confirms receipt.
create policy "payment_proofs_admin_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and public.is_admin());
