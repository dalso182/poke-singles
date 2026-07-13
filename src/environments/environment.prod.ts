// Prod environment — used by `ng build --configuration=production` (the prod
// deploy target). Substituted in for environment.ts via angular.json's
// fileReplacements when the production configuration is active.
//
// Points at the prod Supabase project (the original project, promoted to prod
// during the 2026-07 cutover; lives in the Pro org).

export const environment = {
  production: true,
  envName: 'prod',
  supabase: {
    url: 'https://dhslfridsjdmhwzrgebv.supabase.co',
    anonKey: 'sb_publishable_jsLP6YsmsjjVvEZ2JuCkwQ_DP_rWRHA',
  },
  tcgdex: {
    // Empty string = use the SDK default (https://api.tcgdex.net/v2).
    endpoint: 'https://api.tcgdex.net/v2',
  },
  images: {
    // Root-relative URL to the read-only PHP listing endpoint (same-origin in
    // production). Empty string = picker disabled. See environment.ts for setup.
    listUrl: '/card-images/list-images.php',
  },
};
