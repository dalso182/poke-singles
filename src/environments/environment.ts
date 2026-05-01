// Dev environment — used by `npm start` (local) and `ng build --configuration=dev`
// (the future dev.poke-singles.com deploy target). Should point at the dev/staging
// Supabase project once one exists.
//
// `npm run build:prod` (production config) replaces this file with environment.prod.ts
// at build time via angular.json's fileReplacements, so the prod bundle never
// carries dev URLs.
//
// TODO: fill in Supabase URL + anon key when the dev project is created.

export const environment = {
  production: false,
  envName: 'dev',
  supabase: {
    url: '',
    anonKey: '',
  },
};
