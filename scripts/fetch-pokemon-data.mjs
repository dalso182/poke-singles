// Fetches all Pokemon (national-dex number + name + region) from PokeAPI v2
// and writes src/assets/data/pokemon.json. Only 9 HTTP requests (one per generation).
//
// Usage: node scripts/fetch-pokemon-data.mjs

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, '..', 'src', 'assets', 'data', 'pokemon.json');
const API = 'https://pokeapi.co/api/v2';
const GENERATIONS = 9;

const idFromUrl = (url) => {
  const m = url.match(/\/pokemon-species\/(\d+)\/?$/);
  return m ? Number(m[1]) : null;
};

// PokeAPI returns lowercase slugs (e.g. "mr-mime"). Build the human-facing name.
// Special cases come first; everything else is title-cased and hyphen-joined.
const SPECIAL_NAMES = {
  'nidoran-f': 'Nidoran♀',
  'nidoran-m': 'Nidoran♂',
  'farfetchd': "Farfetch'd",
  'sirfetchd': "Sirfetch'd",
  'mr-mime': 'Mr. Mime',
  'mr-rime': 'Mr. Rime',
  'mime-jr': 'Mime Jr.',
  'ho-oh': 'Ho-Oh',
  'porygon-z': 'Porygon-Z',
  'type-null': 'Type: Null',
  'jangmo-o': 'Jangmo-o',
  'hakamo-o': 'Hakamo-o',
  'kommo-o': 'Kommo-o',
  'tapu-koko': 'Tapu Koko',
  'tapu-lele': 'Tapu Lele',
  'tapu-bulu': 'Tapu Bulu',
  'tapu-fini': 'Tapu Fini',
  'flabebe': 'Flabébé',
  'wo-chien': 'Wo-Chien',
  'chien-pao': 'Chien-Pao',
  'ting-lu': 'Ting-Lu',
  'chi-yu': 'Chi-Yu',
};

const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const toDisplayName = (slug) => {
  if (SPECIAL_NAMES[slug]) return SPECIAL_NAMES[slug];
  return slug.split('-').map(titleCase).join(' ');
};

const fetchGen = async (n) => {
  const res = await fetch(`${API}/generation/${n}`);
  if (!res.ok) throw new Error(`gen ${n} → HTTP ${res.status}`);
  const data = await res.json();
  const region = data.main_region.name;
  return data.pokemon_species
    .map((s) => ({
      number: idFromUrl(s.url),
      name: s.name,
      displayName: toDisplayName(s.name),
      region,
    }))
    .filter((p) => p.number != null);
};

const main = async () => {
  console.log(`Fetching ${GENERATIONS} generations from PokeAPI...`);
  const batches = await Promise.all(
    Array.from({ length: GENERATIONS }, (_, i) => fetchGen(i + 1)),
  );
  const all = batches.flat().sort((a, b) => a.number - b.number);

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(all, null, 2) + '\n', 'utf8');

  console.log(`Wrote ${all.length} Pokemon → ${OUT_PATH}`);
  const byRegion = all.reduce((acc, p) => {
    acc[p.region] = (acc[p.region] ?? 0) + 1;
    return acc;
  }, {});
  console.log('By region:', byRegion);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
