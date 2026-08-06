# Plan 010: Make the panel's per-tab result state track reality

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6b2f01f..HEAD -- src/sidepanel/App.tsx src/sidepanel/hooks/activeTab.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `6b2f01f`, 2026-08-06

## Why this matters

Three defects share one root: the side panel's in-memory copy of audit results
(`resultsByTab` in `App.tsx`) does not faithfully mirror the worker's session
cache.

1. **Stale results shown as current.** When an audited tab navigates, the
   worker deletes its cached audit ("so we never show stale data"), but the
   panel's map never deletes anything — so the panel keeps showing the *old
   page's* audit as if it described the new page: old URL in the header, issue
   counts and "Highlight on page" targeting elements that no longer exist.
   Pressing Save on that view fails with "Run an audit on this tab first"
   because the worker's cache is empty.
2. **Any tab anywhere kicks the user out of issue detail.** The active-tab
   hook re-resolves on `chrome.tabs.onUpdated` without checking *which* tab
   updated. Every re-resolve fetches the audit again over messaging, which
   produces a brand-new object; the panel's identity-based comparison then
   treats it as changed, and the route effect resets to the results list —
   throwing the user out of the issue they were reading whenever any
   background tab finishes loading. It also re-ships the entire audit
   (potentially ~1–2 MB) across the message boundary per event.
3. **Out-of-order resolution.** Multiple `resolve()` calls can be in flight at
   once (tab activated + window focus + tab updated); nothing sequences them,
   so an older resolve can land last and set the panel to a tab that is no
   longer active.

## Current state

Files:

- `src/sidepanel/hooks/activeTab.ts` — the `useActiveTab` hook; resolves the
  active tab and its cached audit, re-resolving on three chrome events.
- `src/sidepanel/App.tsx` — the root component; folds `active.cached` into
  `resultsByTab` (lines 168–174) and drives the route from it (179–190).
- `src/background/service-worker.ts` — lines 119–129: clears the session cache
  when a tab starts navigating (`changeInfo.status === 'loading'`). Do not
  modify this file.

`src/sidepanel/hooks/activeTab.ts:85-96` (current):

```ts
    const onActivated = (info: chrome.tabs.OnActivatedInfo): void => {
      if (windowIdRef.current == null || info.windowId === windowIdRef.current) void resolve();
    };
    const onFocus = (): void => void resolve();
    const onUpdated = (
      _tabId: number,
      changeInfo: chrome.tabs.OnUpdatedInfo,
    ): void => {
      // Re-resolve when the front tab finishes a navigation or its title/url
      // changes, so a stale result drops to the empty state.
      if (changeInfo.status === 'complete' || changeInfo.url) void resolve();
    };
```

Note the `_tabId` parameter is discarded — the comment says "the front tab"
but the code fires for every tab. `resolve()` (lines 43–81) awaits
`chrome.windows.getCurrent`, `chrome.tabs.query`, and a `GET_CACHED_AUDIT`
message, then calls `setState` unconditionally; the only guard is the
`cancelled` flag set on unmount (line 102).

`src/sidepanel/App.tsx:167-190` (current):

```tsx
  // Fold a tab's cached audit (from the active-tab hook) into the result map.
  useEffect(() => {
    if (active.tabId != null && active.cached) {
      const id = active.tabId;
      const cached = active.cached;
      setResultsByTab((prev) => (prev[id] === cached ? prev : { ...prev, [id]: cached }));
    }
  }, [active.tabId, active.cached]);

  // Drive the visible route from the active tab. Switching tabs shows that
  // tab's result, or its empty state if it hasn't been audited. We don't
  // disturb the modal sheets or an in-progress run on this tab.
  useEffect(() => {
    if (active.loading) return;
    if (runningTabId != null && runningTabId === tabId) return;
    setError(null);
    setActiveId(null);
    if (result) {
      setRoute(result.issues.length === 0 ? 'pass' : 'results');
    } else {
      setRoute('empty');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, active.loading, result]);
```

The fold effect only ever **adds**. `setResultsByTab` has exactly two call
sites: here and `App.tsx:313` (a finished `RUN_AUDIT`). Neither removes an
entry. `result` is `resultsByTab[tabId]` (line 102); `startedAt` and `url` on
an `AuditResult` (`src/lib/types.ts:36-45`) uniquely identify an audit, which
is exactly how the sync layer keys audits already (`App.tsx:459`:
`` `${result.url}|${result.startedAt}` ``).

Repo conventions: Preact function components with hooks; hand-rolled hooks live
in `src/sidepanel/hooks/` (see `activeTab.ts` itself as the exemplar); comments
explain *why*, matching the existing density. No new dependencies (the repo has
none beyond `preact` at runtime — `package.json`).

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Install   | `npm install`        | exit 0              |
| Typecheck | `npm run typecheck`  | exit 0, no output   |
| Unit tests| `npm run test:unit`  | every suite prints `N/N checks passed`, exit 0 |
| Build     | `npm run build`      | exit 0, dist/ written |
| Smoke     | `npm run test:smoke` | `3/3 checks passed` (requires a prior build) |

## Scope

**In scope** (the only files you should modify):
- `src/sidepanel/hooks/activeTab.ts`
- `src/sidepanel/App.tsx` (only the two effects excerpted above)
- `test/tabState.test.ts` — do NOT modify; listed to say where per-tab tests
  live today. New tests go in a new file (see Test plan).
- `test/activeTab.test.ts` (create)

**Out of scope** (do NOT touch, even though they look related):
- `src/background/service-worker.ts` — its cache-clearing behavior is correct
  and is what the panel must mirror, not change.
- `src/lib/storage.ts`, `src/lib/messages.ts` — no message or storage shape
  changes in this plan.
- The `runAudit` callback and `runningTabId`/`auditDone` state in `App.tsx`
  (lines 276–334) — a separate known issue (concurrent multi-tab audits) not
  fixed here.

## Git workflow

- This repo commits straight to `main` — no feature branches, no PRs
  (deliberate policy).
- One commit for the whole plan. Message style: single imperative summary line,
  e.g. `Keep the panel's per-tab results in step with the worker's cache`.

## Steps

### Step 1: Filter `onUpdated` to the active tab and sequence `resolve()`

In `src/sidepanel/hooks/activeTab.ts`:

1. Keep the latest resolved tab id in a ref (e.g. `const activeTabIdRef =
   useRef<number | null>(null);`), set it inside `resolve()` when `setState`
   runs.
2. In `onUpdated`, use the `_tabId` parameter (rename it `updatedTabId`): only
   call `resolve()` when `updatedTabId === activeTabIdRef.current` (or when
   `activeTabIdRef.current == null`, so the first resolution isn't missed).
3. Add a sequence guard: a `useRef(0)` counter incremented at the top of
   `resolve()`; capture the value, and before each `setState` bail if the
   counter has moved on (an older resolve must never overwrite a newer one).
   Keep the existing `cancelled` check too.

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Make the fold effect authoritative in both directions

In `src/sidepanel/App.tsx`, replace the fold effect (lines 168–174) so that:

- When `active.tabId != null && active.cached` — fold in, but compare by
  **value key**, not identity: if the existing entry has the same `url` and
  `startedAt`, keep `prev` unchanged (this is what stops the re-render/kick-out
  churn even when a fresh clone arrives).
- When `active.tabId != null && active.cached == null && !active.loading` —
  **delete** that tab's entry from `resultsByTab` if present (returning `prev`
  untouched when absent). This is what drops a navigated-away audit.

Do not delete while `active.loading` is true — a resolve in flight briefly
reports no data, and over-clearing there would blank a valid result during a
quick tab switch.

The route effect (179–190) needs no change: once the entry is deleted,
`result` becomes `null` and the existing `else setRoute('empty')` branch takes
over. Do not add `route` to its dependencies.

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Tests

Write `test/activeTab.test.ts` per the Test plan below.

**Verify**: `npx tsx test/activeTab.test.ts` → `N/N checks passed`, exit 0.

### Step 4: Wire the new suite into the test script

Add `tsx test/activeTab.test.ts` into the `test:unit` chain in `package.json`
(alphabetical position not required; append is fine, matching how
`pending-save` was appended).

**Verify**: `npm run test:unit` → all suites pass. `npm run build` → exit 0.
Then `npm run test:smoke` → `3/3 checks passed`.

## Test plan

The panel components themselves have no test infrastructure (no DOM lib, no
runner — a known gap), so test the hook's *logic* the way this repo tests
worker logic: plain `tsx` scripts with a hand-rolled chrome stub. Model the
harness on `test/pending-save.test.ts` (in-memory `chrome` object,
`const checks: [string, boolean][] = []; const ok = (name, cond) => ...`,
`process.exit` at the end).

Because `useActiveTab` is a Preact hook, do not try to render it. Instead,
extract the testable core while implementing Step 1: a plain function (e.g.
`export function shouldResolveForUpdate(updatedTabId: number, activeTabId: number | null): boolean`
and a small `makeResolveSequencer()` helper) exported from `activeTab.ts`, used
by the hook, and tested directly. Same pattern for Step 2: export a pure
`foldCachedAudit(prev, tabId, cached, loading)` reducer from `App.tsx` — or,
to avoid importing a `.tsx` file from a test, place both pure helpers in a new
small module `src/sidepanel/hooks/tabResults.ts` and import it from both
`activeTab.ts`/`App.tsx` and the test. Prefer the shared-module option.

Cases to cover:

1. An update for a background tab (updatedTabId ≠ active) does not trigger
   resolution; one for the active tab does; one arriving while active id is
   still null does.
2. Sequencer: of two overlapping resolves, only the newer one's commit is
   accepted.
3. Fold: same `url|startedAt` → `prev` returned unchanged (identity equal);
   different `startedAt` → replaced.
4. Fold: `cached == null, loading false` → entry deleted; `cached == null,
   loading true` → `prev` unchanged.
5. Fold: `cached == null` for a tab with no entry → `prev` returned unchanged
   (no spurious new object).

**Verification**: `npm run test:unit` → all pass including the new suite.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm run test:unit` exits 0; `test/activeTab.test.ts` exists, runs in the
      chain, and covers the 5 cases above
- [ ] `npm run build` exits 0 and `npm run test:smoke` prints `3/3 checks passed`
- [ ] In `src/sidepanel/hooks/activeTab.ts`, the `onUpdated` listener reads its
      tab-id parameter (`grep -n "_tabId" src/sidepanel/hooks/activeTab.ts`
      returns no matches)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts above don't match the live code (drift since `6b2f01f`).
- Deleting on `cached == null` makes the empty state flash during ordinary
  same-tab re-resolution in manual testing — that means the `loading` guard
  isn't sufficient and the deletion needs a different signal; report rather
  than papering over with timers.
- You find yourself wanting to change `service-worker.ts` or the message
  shapes to make this work.

## Maintenance notes

- Anything that later introduces new `setResultsByTab` call sites must respect
  the value-key comparison (`url|startedAt`), or the kick-out bug returns.
- If per-tab audit history is ever added (multiple results per tab), the fold
  reducer is the single place the retention rule lives.
- Reviewer focus: the interplay between the deletion branch and
  `active.loading`; and that `resolve()`'s sequence guard covers *all three*
  `setState` paths in the function, not just the final one.
- Deferred deliberately: the single `runningTabId`/`auditDone` flag pair
  (wrong under concurrent multi-tab audits) — smaller, separable fix.
