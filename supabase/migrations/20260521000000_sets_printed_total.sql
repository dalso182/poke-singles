-- Add printed_total to sets so we can render card numbers as "#15/151" and
-- let the search RPC recognize "N/M" queries (e.g. "15/151") as an exact
-- card_number + set total filter.
--
-- Backfill pulls from cached TCGdex card payloads. Every card in a set
-- shares the same cardCount.official, so picking one card per set is
-- enough. nullif + regex guards against malformed / missing values.

alter table public.sets
  add column printed_total int check (printed_total is null or printed_total > 0);

update public.sets s
set printed_total = sub.official
from (
  select distinct on (p.set_id)
    p.set_id,
    nullif((tc.data->'set'->'cardCount'->>'official'), '')::int as official
  from public.products p
  join public.tcgdex_cards tc on tc.tcgdex_id = p.tcgdex_id
  where p.set_id is not null
    and tc.data->'set'->'cardCount'->>'official' ~ '^\d+$'
) sub
where s.id = sub.set_id
  and s.printed_total is null;
