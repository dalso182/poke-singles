-- Weekly cron schedule for the price-review check. Split from the core
-- schema (20260525003500) so a missing pg_cron extension can't block the
-- table/RPC migration. If pg_cron isn't already enabled, this will enable
-- it on the project (Supabase hosted projects support pg_cron in the
-- extensions catalog).
--
-- The schedule body honors app_settings.price_review_enabled — flipping
-- that off in /admin/config disables the cron without unscheduling it.
--
-- Prerequisites (one-time, in the Supabase dashboard → Project Settings →
-- Vault):
--   - `price_check_url`     : full URL of the deployed price-check edge function
--                             (e.g. https://<project-ref>.supabase.co/functions/v1/price-check)
--   - `supabase_anon_key`   : already present for the raffle-result trigger.
--
-- The body mirrors notify_raffle_result()'s pg_net pattern (net.http_post,
-- vault.decrypted_secrets, swallow-and-skip on failure).

create extension if not exists pg_cron;

-- Idempotent: drop any prior copy of the job before re-scheduling.
do $$
begin
  perform cron.unschedule('price-check-weekly');
exception when others then
  null;  -- first run; job didn't exist yet
end;
$$;

-- Monday 10:00 UTC = Monday 04:00 Costa Rica time. Ready for the admin's
-- Monday-morning review without overlapping store traffic.
select cron.schedule(
  'price-check-weekly',
  '0 10 * * 1',
  $cron$
  do $body$
  declare
    v_url     text;
    v_anon    text;
    v_enabled boolean;
  begin
    select price_review_enabled into v_enabled
      from public.app_settings where id = true;
    if v_enabled is distinct from true then
      return;
    end if;

    begin
      select decrypted_secret into v_url
        from vault.decrypted_secrets where name = 'price_check_url';
      select decrypted_secret into v_anon
        from vault.decrypted_secrets where name = 'supabase_anon_key';
      if v_url is not null and v_anon is not null then
        perform net.http_post(
          url := v_url,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_anon
          ),
          body := jsonb_build_object('trigger', 'cron')
        );
      end if;
    exception when others then
      -- A scheduling failure must never break the job; the next week's tick
      -- will retry. Manual "Ejecutar revisión ahora" remains available.
      null;
    end;
  end;
  $body$;
  $cron$
);
