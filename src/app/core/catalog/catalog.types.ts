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
  price: number;
  quantity: number;
  image_url: string | null;
  active: boolean;
  first_listed_at: string;
  last_restocked_at: string | null;
  created_at: string;
  updated_at: string;
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
  price: number;
  quantity?: number;
  image_url?: string | null;
  active?: boolean;
}

export type ProductUpdate = Partial<Omit<ProductInsert, 'category_id'>> & {
  category_id?: string;
};

export type ConditionCode = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';
export type LanguageCode = 'EN' | 'ES' | 'JP';

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
