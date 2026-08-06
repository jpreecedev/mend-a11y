# Plan 016: Tell the user when an audit was partial — and make partial detection real

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6b2f01f..HEAD -- src/lib/audit.ts src/sidepanel/screens/ResultsScreen.tsx src/sidepanel/screens/PassScreen.tsx test/audit.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. Exception: `test/audit.test.ts`
> is EXPECTED to exist (plan 015 creates it); its absence is the STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/015-audit-lifecycle-tests.md (characterization first)
- **Category**: bug
- **Planned at**: commit `6b2f01f`, 2026-08-06

## Why this matters

When frame injection partly fails, `runAudit` marks the result
`partial: true` and writes a ready-made `partialReason` string — which is
then shown to nobody. `grep -rn "partialReason" src/` has exactly three hits:
the type (`types.ts:44`), the assignment (`audit.ts:263-265`), and the upload
payload (`sync.ts:79`). The dashboard learns the audit was partial; the
person looking at the page sees an ordinary result — including the
full-screen "PASSED" stamp — for a page that was only partly scanned. An
accessibility auditor overstating its own coverage is a product-integrity
bug, not a cosmetic one.

Second, the detection itself is suspect: the all-frames path flags
`partial` when a frame's `result === null`, but for a `files:` injection
Chrome usually reports `undefined` (or an `error` property, added in Chrome
135's `InjectionResult`) for a failed frame — so the common case ("top frame
fine, ad iframe blocked") may silently pass as complete. Plan 015 pinned
today's behavior with two tripwire checks; this plan investigates on a real
page, corrects the predicate, and flips those checks deliberately.

## Current state

- `src/lib/audit.ts:188-196` (current):

```ts
    const injected = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: 'MAIN',
      files: ['vendor/axe.min.js'],
    });
    // A frame that errored shows up with a null result.
    if (injected.some((frame) => frame.result === null && frame.frameId !== 0)) {
      partial = true;
    }
```

- `src/lib/audit.ts:262-265`: `partialReason: partial ? "Some areas of this
  page couldn't be checked, so a few issues may be missing." : undefined`.
- `src/sidepanel/screens/ResultsScreen.tsx` — renders the header block
  (`results-head`, lines 80–113) then `{prompt && <AccountPrompt … />}` (115),
  then the severity tiles. No `partial` read.
- `src/sidepanel/screens/PassScreen.tsx` — `center-stage` with the `PASSED`
  stamp (lines 38–44). No `partial` read.
- The warning-banner pattern to reuse — `src/sidepanel/screens/EmptyScreen.tsx:22-27`:

```tsx
      {error && (
        <div class="warning-banner" role="alert">
          <AlertIcon />
          <span>{error}</span>
        </div>
      )}
```

  (`AlertIcon` comes from `../components/Icon`. The `warning-banner` class is
  already styled in `src/styles/panel.css` — reuse it, don't restyle.)
- `test/audit.test.ts` (from plan 015) — checks 7 and 8 pin the predicate's
  current outcomes and are comment-marked as this plan's pivot.
- Chrome-version context: `package.json` pins `@types/chrome ^0.1.31`; check
  whether the installed `chrome.scripting.InjectionResult` type includes an
  `error` property (`grep -n "error" node_modules/@types/chrome/index.d.ts |
  grep -i injectionresult` or open the type) — if present, prefer it.

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Typecheck | `npm run typecheck`  | exit 0              |
| Unit tests| `npm run test:unit`  | all suites pass, exit 0 |
| Build+smoke | `npm run build && npm run test:smoke` | `3/3 checks passed` |

## Suggested executor toolkit

- The investigation step needs a real Chromium with the built extension —
  the repo's own `test/smoke.mjs` shows the Puppeteer launch recipe
  (`--disable-extensions-except`/`--load-extension`, headful). A throwaway
  script (NOT committed) can load a local fixture page containing a
  cross-origin iframe (e.g. an `<iframe src="https://example.com">` inside a
  `data:`-served or `file:`-served page won't do — activeTab needs a real
  invocation; simplest reliable probe: drive the panel like smoke does, or
  temporarily log `injected` from a scratch build). If a live probe is
  impractical in your environment, the fallback in Step 1 applies.

## Scope

**In scope**:
- `src/lib/audit.ts` — the predicate lines 193–196 only
- `src/sidepanel/screens/ResultsScreen.tsx`, `PassScreen.tsx` — banner render
- `src/sidepanel/screens/` — if a tiny shared component is warranted, add it
  in `src/sidepanel/components/PartialBanner.tsx`; otherwise inline both
- `test/audit.test.ts` — flip/extend the two pivot checks
- `src/styles/panel.css` — ONLY if `warning-banner` needs a spacing variant
  inside `results-head`; keep any addition to a few lines

**Out of scope**:
- `partialReason` wording (product copy, already written and shipped to the
  ingest contract path).
- `sync.ts`, the ingest payload, contract fixtures — `partial` is already in
  the wire contract; nothing changes there.
- The injection ladder's fallback logic (the `catch` branches).

## Git workflow

- Commit straight to `main` (repo policy). One commit, e.g.
  `Surface partial audits in the panel and detect partial frames correctly`.

## Steps

### Step 1: Establish what real Chrome returns for a failed frame

Run one probe (toolkit note above): a page with ≥1 frame the injection cannot
reach, log the `injected` array's per-frame `{ frameId, result, error }`.
Record the answer in your report AND as a comment above the predicate.

**Fallback**: if you cannot run a live probe in your environment, implement
the belt-and-braces predicate in Step 2 (it is correct under every plausible
shape) and say clearly in your report that the probe was reasoned, not
observed — do NOT silently skip the investigation.

### Step 2: Correct the predicate

Replace lines 193–196 with a predicate that treats a non-top frame as failed
when any of: `frame.error != null` (if the installed types carry `error`;
cast through a local structural type if `@types/chrome` lags the runtime —
keep the cast local and commented), `frame.result === null`, or
`frame.result === undefined` — for a `files:` injection no frame legitimately
produces a value, so "anything but a clean entry" is not distinguishable by
result alone; the load-bearing signals are `error` and *missing frames*:
also flag partial when the returned array is missing frames that
`chrome.webNavigation` would report — NO: `webNavigation` is not a granted
permission; do not add permissions. Keep the check to the per-entry signals
above and the comment honest about the residual blind spot (a frame absent
from the array entirely).

Update the comment to state the observed (or reasoned) Chrome behavior and
cite Step 1's probe result.

**Verify**: `npm run typecheck` → exit 0. `npx tsx test/audit.test.ts` →
the two pivot checks now FAIL (expected — proceed to Step 3).

### Step 3: Flip the pivot checks

In `test/audit.test.ts`, update checks 7 and 8 (comment-marked by plan 015)
to the new expectations: `result: null` on a non-top frame ⇒ `partial: true`
(unchanged), `result: undefined` on a non-top frame ⇒ now also
`partial: true`; add a check for `error` set on a non-top frame ⇒
`partial: true`; and a clean single-frame page (`[{ frameId: 0, result:
undefined }]`) ⇒ `partial: false` (must not regress — a top frame's own
undefined is normal).

**Verify**: `npx tsx test/audit.test.ts` → all pass.

### Step 4: Render the banner

In `ResultsScreen.tsx`, immediately after the `results-head` block (i.e.
before line 115's `{prompt && …}`), and in `PassScreen.tsx` immediately after
the `PASSED` stamp/lede block, render:

```tsx
      {result.partial && result.partialReason && (
        <div class="warning-banner" role="status">
          <AlertIcon />
          <span>{result.partialReason}</span>
        </div>
      )}
```

`role="status"` not `role="alert"` — this is standing context, not an
interruption (the EmptyScreen banner uses `alert` because it announces a
just-failed action; match intent, not markup, and note this in the code
comment). Import `AlertIcon` where missing. On PassScreen, place it so the
"PASSED" stamp remains visually primary but the qualifier is unmissable
adjacent to the lede.

**Verify**: `npm run typecheck` → exit 0; `npm run build && npm run
test:smoke` → `3/3 checks passed`.

### Step 5: Full gate

**Verify**: `npm run test:unit` → all suites pass.

## Test plan

- `test/audit.test.ts` — the flipped/extended predicate checks (Step 3); this
  is the behavioral guard.
- The banner itself has no render-test infrastructure (known repo gap); its
  correctness is carried by the typecheck, the smoke test's page-error check,
  and reviewer eyes. State this in the report.

## Done criteria

- [ ] `grep -rn "partialReason" src/sidepanel/` → ≥ 2 hits (both screens)
- [ ] The predicate no longer reads `frame.result === null &&` alone
      (`grep -n "result === null && frame.frameId" src/lib/audit.ts` → empty)
- [ ] Step 1's probe result (observed or explicitly reasoned) is in the
      predicate's comment
- [ ] `npm run typecheck` && `npm run test:unit` exit 0
- [ ] `npm run build && npm run test:smoke` → `3/3 checks passed`
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `test/audit.test.ts` does not exist (plan 015 hasn't landed) — this plan
  depends on it.
- The live probe reveals a shape none of the three signals covers (e.g.
  failed frames omitted from the array entirely, with no error surfaced) —
  report the observed shape; the predicate design changes, and that decision
  isn't yours to improvise.
- The banner requires new CSS beyond a spacing tweak (the `warning-banner`
  class turns out not to compose inside `results-head`/`center-stage`).

## Maintenance notes

- The residual blind spot (a frame missing from the results array entirely)
  is accepted and documented in the predicate comment; if Chrome's
  `InjectionResult` gains richer per-frame status, revisit.
- If a future perf plan dedupes engine injection (probe-before-inject), the
  probe results feed the same partial logic — keep the predicate in one
  helper if that lands.
- Reviewer focus: `role="status"` vs `alert` reasoning; PassScreen placement
  (the qualifier must not be below the fold of the stamp layout).
