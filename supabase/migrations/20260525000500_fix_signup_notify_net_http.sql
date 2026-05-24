-- Fix: handle_new_user() called extensions.http_post (nonexistent on this
-- project — pg_net lives in the `net` schema), so the swallowed exception meant
-- the "nuevo cliente" admin email never fired. Switch to net.http_post. The
-- profile insert is unchanged.

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
      perform net.http_post(
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
