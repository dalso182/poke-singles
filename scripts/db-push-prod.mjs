#!/usr/bin/env node
// Deliberate prod migration push. The Supabase CLI stays linked to the DEV project
// for daily work (`db:push:dev` uses --linked), so pushing to prod must never depend
// on the link. This wrapper requires SUPABASE_PROD_DB_URL in .env.local and passes it
// explicitly via --db-url.
//
// SUPABASE_PROD_DB_URL format (Dashboard → Connect → Session pooler or Direct):
//   postgresql://postgres.<ref>:<db-password>@<pooler-host>:5432/postgres
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const dbUrl = process.env.SUPABASE_PROD_DB_URL;
if (!dbUrl) {
  console.error(
    'SUPABASE_PROD_DB_URL is not set in .env.local.\n' +
    'Add it (connection string from the PROD project: Dashboard → Connect) to push\n' +
    'migrations to prod. This is intentional friction — prod pushes are deliberate.',
  );
  process.exit(1);
}

console.log('Pushing migrations to PROD (dhslfridsjdmhwzrgebv)...');
const result = spawnSync(
  'npx',
  ['--yes', 'supabase', 'db', 'push', '--db-url', dbUrl],
  { stdio: 'inherit', shell: process.platform === 'win32' },
);
process.exit(result.status ?? 1);
