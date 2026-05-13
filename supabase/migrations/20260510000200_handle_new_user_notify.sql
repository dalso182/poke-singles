-- Extend handle_new_user() to also fire a best-effort HTTP POST to the
-- send-signup-email Edge Function via pg_net. Profile creation is
-- unchanged — this only adds the notification call afterward and
-- swallows any failure so signup never blocks on email delivery.
--
-- One-time setup per environment (run in Supabase SQL editor):
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/send-signup-email',
--     'signup_email_url'
--   );
--   select vault.create_secret('<anon-key>', 'supabase_anon_key');
--
-- If either secret is missing, the trigger silently skips notification
-- (still creates the profile row).

create extension if not exists pg_net with schema extensions;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url   text;
  v_anon  text;
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    )
  );

  begin
    select decrypted_secret into v_url
      from vault.decrypted_secrets where name = 'signup_email_url';
    select decrypted_secret into v_anon
      from vault.decrypted_secrets where name = 'supabase_anon_key';
    if v_url is not null and v_anon is not null then
      perform extensions.http_post(
        url := v_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_anon
        ),
        body := jsonb_build_object('user_id', new.id)
      );
    end if;
  exception when others then
    -- Notification failure must never block account creation.
    null;
  end;

  return new;
end;
$$;
