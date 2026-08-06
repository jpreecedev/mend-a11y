// Guards plan 010: the panel's per-tab result state must faithfully mirror
// the worker's session cache — not show a navigated-away tab's stale audit,
// not kick the user out of issue detail when a background tab updates, and
// never let an out-of-order resolve() overwrite a newer one. These are pure
// helpers (no chrome stub needed); the DOM-facing hook itself is exercised
// manually / via test:smoke.
// Run with: tsx test/activeTab.test.ts
import { createSequencer, foldCachedAudit, shouldResolveForUpdate } from '../src/sidepanel/hooks/tabResults';
import type { AuditResult } from '../src/lib/types';

const checks: [string, boolean][] = [];
const ok = (name: string, cond: boolean) => checks.push([name, cond]);

function audit(overrides: Partial<AuditResult> = {}): AuditResult {
  return {
    url: 'https://example.com/page',
    startedAt: 1754400000000,
    durationMs: 1234,
    issues: [],
    totalChecks: 42,
    partial: false,
    ...overrides,
  };
}

async function main(): Promise<void> {
  // --- shouldResolveForUpdate: filter onUpdated to the active tab ---
  ok('a background tab update does not trigger resolution', shouldResolveForUpdate(2, 1) === false);
  ok('an update for the active tab triggers resolution', shouldResolveForUpdate(1, 1) === true);
  ok(
    'an update arriving before any tab is resolved triggers resolution',
    shouldResolveForUpdate(5, null) === true,
  );

  // --- createSequencer: only the newest begun call may commit ---
  {
    const seq = createSequencer();
    const first = seq.begin(); // resolve #1 starts
    const second = seq.begin(); // resolve #2 starts before #1 finishes
    // #1 finishes first (out of order) — its token is stale, must not commit.
    ok('an older resolve is rejected once a newer one has begun', seq.isCurrent(first) === false);
    // #2 finishes — its token is still the latest, so it may commit.
    ok('the newer resolve is accepted', seq.isCurrent(second) === true);
  }

  // --- foldCachedAudit: same audit (by url|startedAt) is a no-op ---
  {
    const a = audit();
    const prev = { 1: a };
    const sameKeyClone = audit(); // different object, same url+startedAt
    const next = foldCachedAudit(prev, 1, sameKeyClone, false);
    ok('folding an unchanged audit returns prev unchanged (same reference)', next === prev);
  }

  // --- foldCachedAudit: a different startedAt replaces the entry ---
  {
    const a = audit();
    const prev = { 1: a };
    const b = audit({ startedAt: a.startedAt + 1000 });
    const next = foldCachedAudit(prev, 1, b, false);
    ok('folding a changed audit replaces the entry', next !== prev && next[1] === b);
  }

  // --- foldCachedAudit: cached == null, loading false deletes the entry ---
  {
    const prev = { 1: audit(), 2: audit({ url: 'https://example.com/other' }) };
    const next = foldCachedAudit(prev, 1, null, false);
    ok('an empty cache with loading false deletes that tab entry', !(1 in next));
    ok('other tabs are left untouched', next[2] === prev[2]);
  }

  // --- foldCachedAudit: cached == null, loading true keeps prev unchanged ---
  {
    const prev = { 1: audit() };
    const next = foldCachedAudit(prev, 1, null, true);
    ok('an empty cache while still loading returns prev unchanged (same reference)', next === prev);
  }

  // --- foldCachedAudit: cached == null for a tab with no entry is a no-op ---
  {
    const prev = { 2: audit() };
    const next = foldCachedAudit(prev, 1, null, false);
    ok(
      'an empty cache for a tab with no existing entry returns prev unchanged (same reference)',
      next === prev,
    );
  }

  let pass = 0;
  for (const [name, cond] of checks) {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
    if (cond) pass++;
  }
  console.log(`\n${pass}/${checks.length} checks passed`);
  process.exit(pass === checks.length ? 0 : 1);
}

void main();
