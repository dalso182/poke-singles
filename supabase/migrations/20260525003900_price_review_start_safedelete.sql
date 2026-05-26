-- Supabase's pg-safeupdate extension blocks unqualified DELETE / UPDATE
-- statements with the runtime error "DELETE requires a WHERE clause", as a
-- guardrail against accidentally wiping a table. The clean-snapshot wipe
-- in admin_price_review_start triggered this — it does want to wipe the
-- whole queue every run, but the extension can't tell intent from accident.
--
-- Fix: add `where true` to the price_reviews delete. That's the idiomatic
-- "I really do mean every row" form that satisfies safeupdate while keeping
-- the intent explicit at the call site. The `price_check_runs` delete
-- already had a real WHERE clause and is unchanged.
--
-- Signature, grants, and call sites stay the same.

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
  delete from public.price_reviews where true;
  delete from public.price_check_runs where id <> v_id;
  return v_id;
end;
$$;
