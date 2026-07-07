-- Dashboard "Top Pokédex" panel: the customers with the most Pokémon captured.
-- Admin-only (security definer + is_admin guard) because it joins auth.users for
-- the email and ranks every customer's collection. Count is derived on the fly
-- with cardinality() — profiles is small, no need to materialize. Customers with
-- an empty dex are excluded; ties break by account seniority (earliest signup).

create or replace function public.admin_pokedex_leaderboard(p_limit int default 10)
returns table (
  id           uuid,
  full_name    text,
  email        text,
  caught_count int
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  return query
  select
    p.id,
    p.full_name,
    u.email::text,
    cardinality(p.caught_pokemon_numbers) as caught_count
  from public.profiles p
  join auth.users u on u.id = p.id
  where cardinality(p.caught_pokemon_numbers) > 0
  order by cardinality(p.caught_pokemon_numbers) desc, p.created_at asc
  limit p_limit;
end;
$$;

grant execute on function public.admin_pokedex_leaderboard(int) to authenticated;
