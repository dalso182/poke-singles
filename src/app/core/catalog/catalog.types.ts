// Local mirrors of the catalog table shapes.
// After `npm run db:push:dev` + `npm run db:types`, these can be replaced with
// `Tables<'products'>` etc. from `../supabase/database.types`. Kept here so the
// app compiles before the regen lands.

export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  sort_order: number;
  created_at: string;
}

export interface CategoryInsert {
  slug: string;
  name: string;
  active?: boolean;
  sort_order?: number;
}

export type CategoryUpdate = Partial<CategoryInsert>;

export interface CardTypeRow {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  sort_order: number;
  created_at: string;
}

export interface CardTypeInsert {
  slug: string;
  name: string;
  active?: boolean;
  sort_order?: number;
}

export type CardTypeUpdate = Partial<CardTypeInsert>;

export interface SetRow {
  id: string;
  code: string;
  name: string;
  series: string | null;
  release_date: string | null;
  symbol_image_url: string | null;
  created_at: string;
}

export interface SetInsert {
  code: string;
  name: string;
  series?: string | null;
  release_date?: string | null;
  symbol_image_url?: string | null;
}

export type SetUpdate = Partial<Omit<SetInsert, 'code'>>;

export interface ProductRow {
  id: string;
  category_id: string;
  set_id: string | null;
  name: string;
  pokemon_name: string | null;
  slug: string;
  description: string | null;
  rarity: string | null;
  card_number: string | null;
  language: string;
  condition: string | null;
  variant: string | null;
  price: number;
  quantity: number;
  image_url: string | null;
  active: boolean;
  first_listed_at: string;
  last_restocked_at: string | null;
  created_at: string;
  updated_at: string;
  tcgdex_id: string | null;
  illustrator: string | null;
  regulation_mark: string | null;
  category: string | null;
  stage: string | null;
  type1: string | null;
  type2: string | null;
  legal_standard: boolean | null;
  legal_expanded: boolean | null;
}

export interface ProductInsert {
  category_id: string;
  set_id?: string | null;
  name: string;
  pokemon_name?: string | null;
  slug: string;
  description?: string | null;
  rarity?: string | null;
  card_number?: string | null;
  language?: string;
  condition?: string | null;
  variant?: string | null;
  price: number;
  quantity?: number;
  image_url?: string | null;
  active?: boolean;
  tcgdex_id?: string | null;
  illustrator?: string | null;
  regulation_mark?: string | null;
  category?: string | null;
  stage?: string | null;
  type1?: string | null;
  type2?: string | null;
  legal_standard?: boolean | null;
  legal_expanded?: boolean | null;
}

export interface TcgdexCardRow {
  tcgdex_id: string;
  data: unknown;
  fetched_at: string;
}

export type ProductUpdate = Partial<Omit<ProductInsert, 'category_id'>> & {
  category_id?: string;
};

export type ConditionCode = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';
export type LanguageCode = 'EN' | 'ES' | 'JP';

// Keys mirror the booleans on TCGdex's `card.variants` object so we can map
// directly between the API response and the stored value.
export type VariantCode =
  | 'normal'
  | 'holo'
  | 'reverse'
  | 'firstEdition'
  | 'wPromo';

export const CONDITION_OPTIONS: readonly { value: ConditionCode; label: string }[] = [
  { value: 'NM', label: 'NM — Near Mint' },
  { value: 'LP', label: 'LP — Lightly Played' },
  { value: 'MP', label: 'MP — Moderately Played' },
  { value: 'HP', label: 'HP — Heavily Played' },
  { value: 'DMG', label: 'DMG — Damaged' },
];

export const LANGUAGE_OPTIONS: readonly { value: LanguageCode; label: string }[] = [
  { value: 'EN', label: 'Inglés' },
  { value: 'ES', label: 'Español' },
  { value: 'JP', label: 'Japonés' },
];

export const VARIANT_OPTIONS: readonly { value: VariantCode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'holo', label: 'Holo' },
  { value: 'reverse', label: 'Reverse Holo' },
  { value: 'firstEdition', label: '1ª edición' },
  { value: 'wPromo', label: 'Promo' },
];

export interface AppSettingsRow {
  id: true;
  exchange_rate_usd_crc: number | null;
  maintenance_mode: boolean;
  maintenance_message: string | null;
  updated_at: string;
}

export type AppSettingsUpdate = Partial<
  Pick<
    AppSettingsRow,
    'exchange_rate_usd_crc' | 'maintenance_mode' | 'maintenance_message'
  >
>;
