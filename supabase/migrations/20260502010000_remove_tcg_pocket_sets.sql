-- One-shot cleanup: TCG Pocket is a mobile-only game whose sets came in via
-- the initial TCGdex import. Those cards aren't sellable singles, so the
-- whole series is dropped here. Future syncs filter the series client-side
-- (see SetsService.syncFromTcgdex) so this only ever needs to run once.
--
-- Products referencing these sets have `set_id` cleared via the existing
-- `on delete set null` FK; no products are deleted.

delete from public.sets
where series = 'Pokémon TCG Pocket';
