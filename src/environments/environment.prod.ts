// Prod environment — used by `ng build --configuration=production` (the prod
// deploy target). Substituted in for environment.ts via angular.json's
// fileReplacements when the production configuration is active.
//
// TODO: fill in Supabase URL + anon key when the prod project is created.

export const environment = {
  production: true,
  envName: 'prod',
  supabase: {
    url: '',
    anonKey: '',
  },
};
