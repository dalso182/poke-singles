// Dev environment — used by `npm start` (local) and `ng build --configuration=dev`
// (the future new.poke-singles.com deploy target). Points at the dev Supabase project
// (currently the only one — used for both local and dev tier).
//
// `npm run build:prod` (production config) replaces this file with environment.prod.ts
// at build time via angular.json's fileReplacements, so the prod bundle never
// carries dev URLs.

export const environment = {
  production: false,
  envName: 'dev',
  supabase: {
    url: 'https://dhslfridsjdmhwzrgebv.supabase.co',
    anonKey: 'sb_publishable_jsLP6YsmsjjVvEZ2JuCkwQ_DP_rWRHA',
  },
};
