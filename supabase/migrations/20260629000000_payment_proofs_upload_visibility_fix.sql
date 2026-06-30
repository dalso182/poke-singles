-- Guest (anon) receipt uploads failed Storage RLS: the payment_proofs upload policy
-- checked `exists (select 1 from public.orders …)` inline, but public.orders has RLS
-- (anon has no SELECT; authenticated sees only own orders), so the subquery returned no
-- rows for a guest and WITH CHECK failed with "new row violates row-level security
-- policy" — even for a valid pending sinpe_or_transfer order. The confirmation page works
-- only because it loads the order through SECURITY DEFINER RPCs (get_guest_order), which
-- the inline policy subquery does not use. Move the check into a SECURITY DEFINER function
-- that bypasses orders RLS and returns only a boolean. Also add an UPDATE policy so the
-- client's upsert:true re-uploads/retries don't hit a missing UPDATE policy.

create or replace function public.order_accepts_proof(p_prefix text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.orders o
    where o.id::text = p_prefix
      and o.status = 'pending'
      and o.payment_method = 'sinpe_or_transfer'
  );
$$;

grant execute on function public.order_accepts_proof(text) to anon, authenticated;

drop policy if exists "payment_proofs_upload_pending_order" on storage.objects;

create policy "payment_proofs_upload_pending_order"
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'payment-proofs'
    and public.order_accepts_proof(split_part(name, '/', 1))
  );

-- upsert:true re-uploads to the same {order_id}/proof.{ext} key issue an UPDATE, not an
-- INSERT — mirror the gate so retries/replacements succeed for customers.
create policy "payment_proofs_update_pending_order"
  on storage.objects for update to anon, authenticated
  using (
    bucket_id = 'payment-proofs'
    and public.order_accepts_proof(split_part(name, '/', 1))
  )
  with check (
    bucket_id = 'payment-proofs'
    and public.order_accepts_proof(split_part(name, '/', 1))
  );
