// Dev environment — used by `npm start` (local) and `ng build --configuration=dev`
// (the dev.poke-singles.com deploy target). Points at the dev Supabase project
// (dev-poke-singles, free org).
//
// `npm run build:prod` (production config) replaces this file with environment.prod.ts
// at build time via angular.json's fileReplacements, so the prod bundle never
// carries dev URLs.

export const environment = {
  production: false,
  envName: 'dev',
  supabase: {
    url: 'https://fdscdinfpmvswinpasdg.supabase.co',
    anonKey: 'sb_publishable_1BXPpc4Z1U5u2nqa64_4SQ_-aDOeYdQ',
  },
  tcgdex: {
    // Empty string = use the SDK default (https://api.tcgdex.net/v2).
    // Set to 'http://localhost:3000/v2' (or wherever your local proxy lives)
    // when you want to hit a local TCGdex mirror during development.
   // endpoint: 'http://localhost:3000/v2',
      endpoint: 'https://api.tcgdex.net/v2',
  },
  images: {
    // Root-relative URL to the read-only PHP listing endpoint that powers the
    // admin image picker. Empty string disables the picker (the URL field
    // becomes manual-only). The PHP file lives at server/list-images.php in
    // the repo and must be uploaded once to the root of the images folder
    // on SiteGround. Relative so it's same-origin in production AND rides the
    // /card-images dev proxy (proxy.conf.mjs) on localhost.
    listUrl: '/card-images/list-images.php',
  },
};
