import { execFileSync } from 'node:child_process';

/** Removes test orders and resets fixture stock after the suite. */
export default function globalTeardown(): void {
  execFileSync('node', ['scripts/e2e-cleanup.mjs'], { stdio: 'inherit' });
}
