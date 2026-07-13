import { execFileSync } from 'node:child_process';

/** Seeds the dev DB fixtures (idempotent) before the suite runs. */
export default function globalSetup(): void {
  execFileSync('node', ['scripts/e2e-seed.mjs'], { stdio: 'inherit' });
}
