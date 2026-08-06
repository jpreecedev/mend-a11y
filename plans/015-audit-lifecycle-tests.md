# Plan 015: Put characterization tests around the audit lifecycle (`src/lib/audit.ts`)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6b2f01f..HEAD -- src/lib/audit.ts test/ package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (test-only; zero `src/` changes)
- **Depends on**: none — and plan 016 depends on THIS plan landing first
- **Category**: tests
- **Planned at**: commit `6b2f01f`, 2026-08-06

## Why this matters

`src/lib/audit.ts` is the feature the extension exists for — engine
injection, the all-frames→top-frame fallback, restricted-page vs
missing-grant error classification, the timeout, and result assembly — and
none of its 273 lines are covered by any test (`grep -rn "lib/audit" test/`
is empty). Every user-facing failure message in the panel comes from this
file's regex classification; a wrong branch turns "click the Mend icon" into
a dead end. Two follow-up plans (016: partial-audit surfacing; a future
injection-dedup perf fix) edit this file; characterization tests must exist
before either does. This plan is purely additive: it pins today's behavior,
including the suspect bits, with comments marking what 016 may change.

## Current state

- `src/lib/audit.ts` — the whole file is in scope for *reading*. Key
  structure at `6b2f01f`:
  - `runAxeInPage(args)` (13–103) — MAIN-world function; self-contained; reads
    `window.axe`, runs the engine, computes `domOrder` by document position.
    Returns an *empty* `RawRunnerResult` when `window.axe` is absent (22–23).
  - `assertAuditable(url)` (105–138) — throws on `chrome:`/store/etc. URLs;
    deliberately silent on unparseable/empty urls (documented in its comment).
  - `isRestrictedPageError` / `isPermissionError` (144–157) — regex
    classification of `executeScript` failures.
  - `runAudit(tabId)` (171–273) — orchestration; the fallback ladder is
    excerpted below.

`src/lib/audit.ts:186-217` (current — the injection ladder):

```ts
  let partial = false;
  try {
    const injected = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: 'MAIN',
      files: ['vendor/axe.min.js'],
    });
    // A frame that errored shows up with a null result.
    if (injected.some((frame) => frame.result === null && frame.frameId !== 0)) {
      partial = true;
    }
  } catch (frameErr) {
    if (isRestrictedPageError(frameErr)) throw restrictedPageError();
    if (isPermissionError(frameErr)) throw needsInvocationError();
    console.warn('[mend] all-frames injection failed; retrying top frame only.', frameErr);
    partial = true;
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        files: ['vendor/axe.min.js'],
      });
    } catch (topErr) {
      if (isRestrictedPageError(topErr)) throw restrictedPageError();
      if (isPermissionError(topErr)) throw needsInvocationError();
      throw new Error("Mend couldn't load on this page. Try reloading the tab and running again.");
    }
  }
```

Then: an empty-url re-read (221–228), the audit run via
`withTimeout(chrome.scripting.executeScript({ func: runAxeInPage, ... }),
AUDIT_TIMEOUT_MS, ...)` (233–245), defaulting of a missing runner result
(247–250), `normalizeRunnerResult`, result assembly with
`partialReason` (256–266), `setCachedAudit`, return.

Known-suspect behavior to pin AS-IS (do not "fix" here — that is plan 016):
the `frame.result === null && frame.frameId !== 0` predicate. For a `files:`
injection Chrome typically reports a file's completion value as
`undefined`/absent rather than `null`, so this predicate may never match. Pin
whatever the code does today with an explicit comment:
`// Pins current behavior; plan 016 investigates whether this predicate ever fires in real Chrome.`

Existing harness conventions (match them exactly):

- Suites are standalone `tsx` scripts: `const checks: [string, boolean][] = [];
  const ok = (name: string, cond: boolean) => checks.push([name, cond]);`,
  a `main()` that ends with the pass-count print and `process.exit` — see
  `test/pending-save.test.ts` (also the chrome-stub exemplar, lines 18–43)
  and `test/timeout.test.ts` (which already covers `withTimeout` itself —
  don't re-test `src/lib/async.ts`).
- `test/pipeline.test.ts` covers `normalizeRunnerResult` downstream — don't
  re-test normalization; assert only that `runAudit` passes the raw result
  through (issue count in the assembled `AuditResult`).

`runAudit` imports at module top: `getSettings`, `setCachedAudit` from
`./storage` (chrome.storage-backed — the in-memory stub covers them), `DOCS`
from `../docs`, `withTimeout` from `./async`. Importing `src/lib/audit.ts`
does NOT import the service worker (no listener registration side effects) —
it is safe to import directly under a stubbed `chrome` global.

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Typecheck | `npm run typecheck`  | exit 0              |
| New suite | `npx tsx test/audit.test.ts` | `N/N checks passed`, exit 0 |
| Unit tests| `npm run test:unit`  | all suites pass, exit 0 |

## Scope

**In scope**:
- `test/audit.test.ts` (create)
- `package.json` — append `tsx test/audit.test.ts` to `test:unit`

**Out of scope (do NOT touch)**:
- `src/lib/audit.ts` — this is a characterization plan; ANY `src/` diff is a
  failure of this plan.
- `test/timeout.test.ts`, `test/pipeline.test.ts` — already own their layers.

## Git workflow

- Commit straight to `main` (repo policy). One commit, e.g.
  `Characterize the audit lifecycle: injection ladder, error classes, timeout`.

## Steps

### Step 1: Build the chrome stub for audit runs

In `test/audit.test.ts`, assemble a stub `chrome` global modeled on
`test/pending-save.test.ts:18-43`, extended with a scriptable
`chrome.scripting.executeScript` — a queue/dispatcher the test configures per
case, keyed on the call shape (`files:` vs `func:` and `allFrames`), so one
test can express: "all-frames files-injection rejects with message X; the
top-frame retry resolves; the func run resolves with result R".
`chrome.tabs.get` returns a configurable `{ url }`. Storage areas: in-memory,
as in the exemplar. Settings: seed `store.settings` with
`DEFAULT_SETTINGS` (import from `../src/lib/storage`).

**Verify**: `npx tsx test/audit.test.ts` runs (0 checks yet is fine), exit 0.

### Step 2: Pin `assertAuditable` and the error classifiers

Direct unit checks (these are exported? — no: `assertAuditable`,
`isRestrictedPageError`, `isPermissionError` are module-private. Test them
**through `runAudit`**, not by adding exports — exporting internals would be
a `src/` change, which is out of scope):

1. `chrome.tabs.get` → `{ url: 'chrome://settings' }` ⇒ `runAudit` rejects
   with the "not browser or extension pages" message (assert on a distinctive
   substring, e.g. `/browser or extension pages/`).
2. `{ url: 'https://chromewebstore.google.com/detail/x' }` ⇒ rejects with the
   Web Store message (`/Web Store/`).
3. `{ url: '' }` + all-frames injection rejecting with
   `Cannot access contents of the page` ⇒ rejects with the "Click the Mend
   icon" guidance (`/Click the Mend icon/`).
4. `{ url: '' }` + injection rejecting with
   `The extensions gallery cannot be scripted.` ⇒ the restricted-page message.

**Verify**: `npx tsx test/audit.test.ts` → all pass so far.

### Step 3: Pin the fallback ladder and `partial`

5. Happy path: all-frames resolves `[{ frameId: 0, result: undefined }]`,
   func-run resolves `[{ result: <a RawRunnerResult with 2 violations> }]` ⇒
   resolves; `partial === false`; `issues.length` matches; result was cached
   (assert the session-store key `audit:<tabId>`).
6. All-frames **rejects** with a generic error (`'Frame with ID 42 was
   removed.'` — matches neither classifier) and the top-frame retry resolves
   ⇒ `partial === true`, `partialReason` set, audit still succeeds.
7. All-frames resolves with `[{ frameId: 0, result: undefined }, { frameId: 7,
   result: null }]` ⇒ pin whatever `partial` comes out as (expected `true`
   per the code); comment-mark this check as the plan-016 pivot.
8. All-frames resolves with `[{ frameId: 0, result: undefined }, { frameId: 7,
   result: undefined }]` ⇒ pin the outcome (expected `partial === false` —
   this is the suspected real-Chrome shape for an errored frame; the pin
   documents today's blindness, plan 016 decides what it should be).
9. Both injections reject with generic errors ⇒ rejects with
   `/couldn't load on this page/`.

**Verify**: `npx tsx test/audit.test.ts` → all pass.

### Step 4: Pin the timeout and the empty-url re-read

10. The func-run returns a promise that never resolves; use fake-clock
    technique: `withTimeout` uses real `setTimeout`, so instead configure the
    stub to return a promise that never settles and assert rejection via a
    race with a short real timer is NOT acceptable (45 s real wait). Instead:
    pin the timeout *message path* by having the func-run **reject** — no,
    that takes the generic-rejection path. Correct approach: temporarily
    shrink time by monkey-patching `globalThis.setTimeout` before importing
    `audit.ts`? `withTimeout` (see `src/lib/async.ts`) captures `setTimeout`
    at call time, so a global patch installed in the test's setup (before
    calling `runAudit`, patching `setTimeout` to invoke callbacks for delays
    ≥ 45_000 immediately, passing through shorter ones) is sufficient and
    self-contained. Assert rejection message `/too large to finish scanning/`.
    Restore the real `setTimeout` in a `finally`.
11. `{ url: '' }`, injection succeeds, and `chrome.tabs.get` returns a url on
    the second call ⇒ the assembled result's `url` is the re-read value.
12. Func-run resolves `[{ result: undefined }]` (runner returned nothing) ⇒
    resolves with zero issues and `totalChecks === 0` (the fallback empty
    result at 247–250), rather than rejecting.

**Verify**: `npx tsx test/audit.test.ts` → all pass; then wire into
`package.json` `test:unit` and run `npm run test:unit` → all suites pass.

## Test plan

This plan IS the test plan; the twelve cases above are the deliverable.
Structural pattern: `test/pending-save.test.ts`. Keep every case independent
by resetting the stub queues between cases (a `reset()` helper), since the
suite is one process.

## Done criteria

- [ ] `test/audit.test.ts` exists with ≥ 12 checks, all passing
- [ ] `npm run test:unit` exits 0 with the new suite in the chain
- [ ] `git diff --stat -- src/` is empty (characterization only)
- [ ] Checks 7 and 8 carry the plan-016 pivot comments
- [ ] `npm run typecheck` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- Importing `src/lib/audit.ts` under the stub throws at import time
  (an unexpected side effect — the module was believed side-effect-free).
- The `setTimeout` patch in check 10 can't isolate the 45 s timer from other
  timers the test needs (report; do not ship a flaky timing test).
- Any check requires exporting a private symbol from `audit.ts`.

## Maintenance notes

- Checks 7/8 are deliberate tripwires: plan 016 will flip one of them when it
  corrects the partial-frame predicate. Whoever executes 016 updates these
  two checks in the same commit as the predicate change — that is the point.
- When a perf plan later dedupes engine injection (probe-before-inject), the
  Step-1 stub's call-shape dispatcher is where the new probe call gets
  scripted; extend, don't rewrite.
- Reviewer focus: no `src/` diff; case independence (stub reset between
  cases); the timeout patch restores the real `setTimeout` even on failure.
