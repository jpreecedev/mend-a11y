// Guards plan 014's re-arm rule: a changed dashboard API key must invalidate
// previous refusals recorded under the old key, so the auto-upload effect's
// "already have a state entry for this audit" guard doesn't permanently skip
// an audit just because the first (bad) key drew a 401. clearErrorEntries is
// pure -- no chrome stub needed.
// Run with: tsx test/sync-rearm.test.ts
import { clearErrorEntries } from '../src/sidepanel/syncState';
import type { SyncInfo } from '../src/sidepanel/components/SyncStatus';

const checks: [string, boolean][] = [];
const ok = (name: string, cond: boolean) => checks.push([name, cond]);

function main(): void {
  // --- a non-retryable error entry is dropped; a synced entry is kept ---
  const withError: Record<string, SyncInfo> = {
    a: { phase: 'error', retryable: false },
    b: { phase: 'synced' },
  };
  const afterError = clearErrorEntries(withError);
  ok('the error entry is dropped', !('a' in afterError));
  ok('the synced entry is kept', afterError.b?.phase === 'synced');
  ok('nothing else was added', Object.keys(afterError).length === 1);

  // --- a retryable error entry is also dropped: a new key re-arms it too ---
  const withRetryable: Record<string, SyncInfo> = {
    a: { phase: 'error', retryable: true },
  };
  const afterRetryable = clearErrorEntries(withRetryable);
  ok('a retryable error entry is also dropped', Object.keys(afterRetryable).length === 0);

  // --- an in-flight upload is untouched, and identity is preserved ---
  const uploading: Record<string, SyncInfo> = { a: { phase: 'uploading' } };
  const afterUploading = clearErrorEntries(uploading);
  ok('an uploading entry is left alone', afterUploading.a?.phase === 'uploading');
  ok('nothing dropped returns the same reference', afterUploading === uploading);

  // --- the empty map is a no-op, identity-preserving too ---
  const empty: Record<string, SyncInfo> = {};
  ok('the empty map returns the same reference', clearErrorEntries(empty) === empty);

  let pass = 0;
  for (const [name, cond] of checks) {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
    if (cond) pass++;
  }
  console.log(`\n${pass}/${checks.length} checks passed`);
  process.exit(pass === checks.length ? 0 : 1);
}

main();
