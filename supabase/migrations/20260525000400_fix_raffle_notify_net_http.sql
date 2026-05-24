-- Fix: pg_net's http_post lives in the `net` schema on this project, not
-- `extensions`. The original notify_raffle_result() called
-- extensions.http_post (which doesn't exist), so it raised and was swallowed by
-- the exception guard — no notification ever fired. Switch to net.http_post.

create or replace function public.notify_raffle_result()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_url  text;
  v_anon text;
begin
  begin
    select decrypted_secret into v_url
      from vault.decrypted_secrets where name = 'raffle_result_url';
    select decrypted_secret into v_anon
      from vault.decrypted_secrets where name = 'supabase_anon_key';
    if v_url is not null and v_anon is not null then
      perform net.http_post(
        url := v_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_anon
        ),
        body := jsonb_build_object('product_id', new.product_id)
      );
    end if;
  exception when others then
    -- Notification failure must never block / roll back the draw.
    null;
  end;
  return new;
end;
$$;
