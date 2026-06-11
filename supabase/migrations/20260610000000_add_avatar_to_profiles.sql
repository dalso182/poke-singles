-- Profile avatar selection. Stores only the national-dex number of the Pokémon
-- the customer picked on /account; the artwork is a static asset resolved
-- client-side as assets/images/avatars/{number}.png. The full Pokémon list is
-- client-side reference data (src/assets/data/pokemon.json, ~1,025 entries) that
-- never changes and never joins to anything here, so a single nullable column is
-- all the DB needs. Writes are already covered by the profiles_self_update RLS
-- policy (no new policy required).

alter table public.profiles
  add column avatar_pokemon_number integer
    check (avatar_pokemon_number is null or avatar_pokemon_number between 1 and 1025);
