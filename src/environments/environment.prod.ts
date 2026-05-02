// Prod environment — used by `ng build --configuration=production` (the prod
// deploy target). Substituted in for environment.ts via angular.json's
// fileReplacements when the production configuration is active.
//
// TODO: fill in Supabase URL + anon key when the prod project is created.

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
};
