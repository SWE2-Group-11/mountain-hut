import { execSync } from 'node:child_process';

// Playwright stops the `docker run` process of Mailpit, not the container itself,
// which would keep running and holding ports 1025 and 8025: remove it explicitly.
export default function globalTeardown() {
  try {
    execSync('docker rm -f e2e-mailpit', { stdio: 'ignore' });
  } catch {
    // Not started by this run (an already running Mailpit was reused): nothing to remove
  }
}