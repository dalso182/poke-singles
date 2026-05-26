-- Clean-snapshot semantics for the price-review queue. Each run is a fresh
-- look: when a new check starts, every prior row is gone — both the flagged
-- queue rows in price_reviews and the old run rows in price_check_runs. Only
-- the brand-new run row and the rows it produces survive.
--
-- Why both tables: "only the most recent run data" is the literal user spec.
-- The admin-screen "última ejecución" line reads from price_check_runs and
-- just needs the latest row, so wiping the rest costs nothing in UX.
--
-- Why inside admin_price_review_start (not in the runners): runners (browser
-- + edge function) call this exactly once per logical run. Self-chained edge
-- batches reuse the existing run_id and DON'T re-enter this function, so the
-- wipe runs once per logical run, never mid-sweep.
--
-- Signature, grants, and call sites are unchanged.

create or replace function public.admin_price_review_start(p_trigger text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_trigger not in ('manual', 'cron') then
    raise exception 'INVALID_TRIGGER';
  end if;
  insert into public.price_check_runs (trigger) values (p_trigger)
    returning id into v_id;
  -- Wipe everything that isn't this run.
  delete from public.price_reviews;
  delete from public.price_check_runs where id <> v_id;
  return v_id;
end;
$$;
