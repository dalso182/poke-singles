-- Per-minute cron for the auction worker. Split from the close logic
-- (20260718000100) so a missing pg_cron can't block the function migration —
-- same split as the price-review cron (20260525003600).
--
-- The tick is cheap when idle: two indexed scans over the tiny `auctions`
-- table, no http unless something is due. No feature flag — an auction with
-- no ends_at or no ended rows is a no-op.
--
-- Prerequisites (one-time, Supabase dashboard → Project Settings → Vault):
--   - `auction_result_url`   : URL of the deployed send-auction-result function
--                              (https://<project-ref>.supabase.co/functions/v1/send-auction-result)
--   - `auction_reminder_url` : URL of the deployed send-auction-reminder function
--   - `supabase_anon_key`    : already present (raffle-result / price-check).

create extension if not exists pg_cron;

-- Idempotent: drop any prior copy of the job before re-scheduling.
do $$
begin
  perform cron.unschedule('auctions-minutely');
exception when others then
  null;  -- first run; job didn't exist yet
end;
$$;

select cron.schedule(
  'auctions-minutely',
  '* * * * *',
  $cron$
  do $body$
  begin
    perform public.process_auctions();
  exception when others then
    -- Never let one bad tick break the schedule; the next minute retries.
    null;
  end;
  $body$;
  $cron$
);
