-- Customer Pokédex collection. Stores the national-dex numbers the customer has
-- "caught", as a plain integer[] on their profile. A single array column rather
-- than one row per Pokémon: the Pokédex screen reads the whole set at once and
-- the profile is already loaded on /account (ProfilesService selects '*'), so the
-- owned set rides along with zero extra queries. ≤1025 small ints is a few KB.
-- The full Pokémon list itself is client-side reference data
-- (src/assets/data/pokemon.json); only ownership lives here. Writes are already
-- covered by the profiles_self_update RLS policy (no new policy required).
--
-- If a future "fill" mechanism needs per-Pokémon metadata (date caught, source
-- order, count), migrate this to a dedicated caught_pokemon table then.

alter table public.profiles
  add column caught_pokemon_numbers integer[] not null default '{}';
