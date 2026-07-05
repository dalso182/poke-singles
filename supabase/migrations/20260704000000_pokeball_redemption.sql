-- Pokéball redemption — the Pokédex "fill" mechanism (loyalty Phase 2: spending).
--
-- Customers spend Poke-Monedas to open a Pokéball tier that awards N random
-- not-yet-owned Pokémon into profiles.caught_pokemon_numbers. Everything runs
-- through the open_pokeball() SECURITY DEFINER RPC so the balance check, the
-- ledger debit, and the award are one atomic transaction; tier costs/awards live
-- in app_settings.pokeball_tiers (public-read singleton) so the UI displays the
-- same numbers the server enforces — no client/server drift.

-- ─── Ledger: new 'redeem' kind ───────────────────────────────────────────────
-- Spends are negative-amount rows, distinct from 'adjust' so the /account
-- history and admin report can label them properly.
alter table public.loyalty_transactions
  drop constraint loyalty_transactions_kind_check;
alter table public.loyalty_transactions
  add constraint loyalty_transactions_kind_check
  check (kind in ('earn', 'reversal', 'adjust', 'redeem'));

-- ─── Tier config ─────────────────────────────────────────────────────────────
-- Placeholder economy values (cost in Poke-Monedas → Pokémon awarded); tune by
-- updating this row — no code change needed. `label` feeds both the modal and
-- the ledger description; presentation-only styling (colors) stays client-side.
alter table public.app_settings
  add column pokeball_tiers jsonb not null default '[
    {"key": "poke",   "label": "Poké Ball",   "cost": 1, "award": 1},
    {"key": "super",  "label": "Super Ball",  "cost": 2, "award": 3},
    {"key": "ultra",  "label": "Ultra Ball",  "cost": 3, "award": 5},
    {"key": "master", "label": "Master Ball", "cost": 4, "award": 10}
  ]'::jsonb;

-- ─── Lock down the collection column ─────────────────────────────────────────
-- profiles_self_update RLS is row-level only, so until now a customer could
-- PATCH caught_pokemon_numbers directly via REST and fill their dex for free.
-- Narrow the client grants to an explicit column list; only this migration's
-- SECURITY DEFINER RPC (runs as table owner) can write the collection.
-- NOTE: future client-editable profile columns must be added to these lists.
revoke update on public.profiles from authenticated;
grant  update (full_name, phone, default_shipping_address, avatar_pokemon_number)
  on public.profiles to authenticated;
-- Same for INSERT (ProfilesService self-heals a missing row client-side).
revoke insert on public.profiles from authenticated;
grant  insert (id, full_name, phone, default_shipping_address, avatar_pokemon_number)
  on public.profiles to authenticated;

-- ─── open_pokeball RPC ───────────────────────────────────────────────────────
-- Atomically: validate tier → lock the caller's profile row (serializes
-- concurrent opens per user) → check balance → pick N random unowned dex
-- numbers → debit the ledger → append to the collection. Business failures
-- return jsonb {ok:false, error:CODE} (place_order style) so the modal can show
-- friendly messages; only unexpected states raise.
create or replace function public.open_pokeball(p_tier text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_tier    jsonb;
  v_cost    int;
  v_award   int;
  v_profile public.profiles%rowtype;
  v_balance int;
  v_awarded int[];
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;

  select t into v_tier
  from public.app_settings s,
       jsonb_array_elements(s.pokeball_tiers) t
  where s.id = true and t->>'key' = p_tier;
  if v_tier is null then
    return jsonb_build_object('ok', false, 'error', 'UNKNOWN_TIER');
  end if;
  v_cost  := (v_tier->>'cost')::int;
  v_award := (v_tier->>'award')::int;

  -- Per-user lock: both spend paths (balance check + award) serialize here, so
  -- two concurrent opens can't both pass the balance check or double-award.
  select * into v_profile
  from public.profiles
  where id = v_uid
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NO_PROFILE');
  end if;

  select coalesce(sum(amount), 0) into v_balance
  from public.loyalty_transactions
  where user_id = v_uid;
  if v_balance < v_cost then
    return jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_POINTS');
  end if;

  -- Random not-owned pick straight from the dex range (1..1025 — matches the
  -- avatar_pokemon_number check constraint); no Pokémon table needed. When
  -- fewer than v_award remain, the remainder is awarded at full cost
  -- (near-complete-dex edge, acceptable).
  select array_agg(n) into v_awarded
  from (
    select n
    from generate_series(1, 1025) as n
    where not (n = any (v_profile.caught_pokemon_numbers))
    order by random()
    limit v_award
  ) s;
  if v_awarded is null then
    return jsonb_build_object('ok', false, 'error', 'POKEDEX_COMPLETE');
  end if;

  insert into public.loyalty_transactions (user_id, amount, kind, description)
  values (v_uid, -v_cost, 'redeem', 'Pokébola: ' || (v_tier->>'label'));

  update public.profiles
  set caught_pokemon_numbers = caught_pokemon_numbers || v_awarded
  where id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'awarded', to_jsonb(v_awarded),
    'new_balance', v_balance - v_cost
  );
end;
$$;

grant execute on function public.open_pokeball(text) to authenticated;
