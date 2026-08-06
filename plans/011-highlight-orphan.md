# Plan 011: Clear the highlight overlay on the tab that actually has it

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6b2f01f..HEAD -- src/background/service-worker.ts src/sidepanel/App.tsx src/lib/messages.ts test/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `6b2f01f`, 2026-08-06

## Why this matters

The highlight overlay draws a border **plus a full-viewport dimming scrim**
(`box-shadow: 0 0 0 9999px rgba(20, 16, 12, 0.25)`) on the audited page, with a
`requestAnimationFrame` loop keeping it glued to the element. Reproduce the
bug: highlight an issue on tab A, then switch to tab B. The panel's "leaving
detail" cleanup sends `CLEAR_HIGHLIGHT` for the *current* tab (B — a no-op),
and the worker's handler *unconditionally nulls the stored highlight-tab id*
before clearing. From that moment the overlay on tab A is unreachable: the
panel-close teardown reads that stored id as its backstop, finds `null`, and
clears nothing. Tab A stays dimmed with a live rAF loop until the user reloads
it. For an accessibility tool, leaving a page visually obstructed is about the
worst trust-breaking bug available.

## Current state

Files:

- `src/background/service-worker.ts` — owns the stored highlight tab id
  (`HL_KEY`, lines 46–68) and the `CLEAR_HIGHLIGHT` handler (202–211).
- `src/sidepanel/App.tsx` — sends `CLEAR_HIGHLIGHT` from three places, all
  targeting the *active* tab, never the highlighted one.
- `src/lib/messages.ts` — `PanelMessage` union; `CLEAR_HIGHLIGHT` currently
  carries `tabId: number` (line 10).
- `src/lib/highlight.ts` — the injected page functions; already correct, do
  not modify.

`src/background/service-worker.ts:191-211` (current):

```ts
    case 'HIGHLIGHT': {
      void setHighlightTab(message.tabId);
      await chrome.scripting
        .executeScript({
          target: { tabId: message.tabId },
          func: highlightInPage,
          args: [message.selector, HIGHLIGHT_ACCENT],
        })
        .catch((e: unknown) => console.warn('[mend] highlight failed', e));
      return { ok: true };
    }
    case 'CLEAR_HIGHLIGHT': {
      void setHighlightTab(null);
      await chrome.scripting
        .executeScript({
          target: { tabId: message.tabId },
          func: clearHighlightInPage,
        })
        .catch(() => {});
      return { ok: true };
    }
```

The stored-id helpers (46–74) — `setHighlightTab`, `getHighlightTab`,
`clearHighlightOn` — already exist and are what the port-disconnect backstop
uses (148–161). The worker also nulls the stored id when the highlighted tab
itself navigates or closes (119–140); that behavior is correct — the browser
tears the overlay down on navigation.

`src/sidepanel/App.tsx` senders (current):

```tsx
/* 376-378 — targets the ACTIVE tab */
  const clearHighlight = useCallback(() => {
    if (tabId != null) void sendToWorker({ type: 'CLEAR_HIGHLIGHT', tabId });
  }, [tabId]);

/* 442-445 — fires on every route change AND every clearHighlight identity
   change (i.e. every tab switch, because of the [tabId] dep above) */
  useEffect(() => {
    if (route !== 'detail') clearHighlight();
  }, [route, clearHighlight]);

/* 139-148, inside the mount effect — panel-hide cleanup, same defect:
   activeIdForRun.current is the active tab, not the highlighted one */
    const clearOnLeave = (): void => {
      const id = activeIdForRun.current;
      if (id != null) {
        try {
          void chrome.runtime.sendMessage({ type: 'CLEAR_HIGHLIGHT', tabId: id });
        } catch { /* worker may already be tearing down; ... */ }
      }
    };
```

`src/lib/messages.ts:10`: `| { type: 'CLEAR_HIGHLIGHT'; tabId: number }`.

Repo conventions: worker message handlers live in the `handleMessage` switch
and are unit-tested by driving `handleMessage` directly with a stubbed `chrome`
global — see `test/pending-save.test.ts` (its `chrome` stub at lines 36–43 and
`scripting: { executeScript: async () => [] }`). Match that harness.

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Typecheck | `npm run typecheck`  | exit 0              |
| Unit tests| `npm run test:unit`  | all suites `N/N checks passed`, exit 0 |
| Build     | `npm run build`      | exit 0              |
| Smoke     | `npm run test:smoke` | `3/3 checks passed` |

## Scope

**In scope**:
- `src/background/service-worker.ts` — the `CLEAR_HIGHLIGHT` case only
- `src/lib/messages.ts` — the `CLEAR_HIGHLIGHT` member of `PanelMessage`
- `src/sidepanel/App.tsx` — the three sender sites excerpted above
- `test/highlight-clear.test.ts` (create)
- `package.json` — append the new suite to `test:unit`

**Out of scope**:
- `src/lib/highlight.ts` — the injected functions are correct.
- The `onUpdated`/`onRemoved`/port-disconnect teardown blocks in the worker
  (119–161) — already correct; they are the *consumers* of the stored id this
  plan stops corrupting.
- Any change to `HIGHLIGHT` (the set path).

## Git workflow

- Commit straight to `main` (repo policy: no branches, no PRs). One commit,
  imperative summary line, e.g. `Clear the highlight overlay on the tab that has it`.

## Steps

### Step 1: Make the worker resolve the target from the stored id

Change the `CLEAR_HIGHLIGHT` case in `handleMessage` to:

1. Read the stored id first: `const stored = await getHighlightTab();`.
2. Clear the overlay on `stored` when it is non-null (via the existing
   `clearHighlightOn(stored)` helper or an awaited `executeScript` with the
   same `.catch(() => {})`).
3. Null the stored id *after* resolving the target: `void setHighlightTab(null)`.
4. Keep the response `{ ok: true }`.

The message's `tabId` becomes unnecessary — remove it from the union in
`src/lib/messages.ts` (`| { type: 'CLEAR_HIGHLIGHT' }`) so the compiler finds
every sender for Step 2. If a defensive fallback feels warranted, clearing
`message`-less means the worker clears only what it knows about; that is the
intended semantics ("clear the highlight, wherever it is").

**Verify**: `npm run typecheck` → errors ONLY at the three `App.tsx` sender
sites (the compiler locating Step 2's work). If it flags other senders you
didn't expect, STOP.

### Step 2: Update the three senders

In `src/sidepanel/App.tsx`:

- `clearHighlight` (376–378): send `{ type: 'CLEAR_HIGHLIGHT' }` with no tab
  id; drop the `tabId != null` guard and the `[tabId]` dependency (the
  callback becomes stable, which also stops the route effect at 443–445 from
  re-firing on every tab switch — a small win for free).
- `clearOnLeave` (139–148): same message, no id, keep the try/catch shape.
- Leave the `route !== 'detail'` effect's logic unchanged.

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Tests

Create `test/highlight-clear.test.ts` per the Test plan; append
`tsx test/highlight-clear.test.ts` to `test:unit` in `package.json`.

**Verify**: `npx tsx test/highlight-clear.test.ts` → all checks pass; then
`npm run test:unit` → exit 0.

### Step 4: Full gate + manual walk

**Verify**: `npm run build` → exit 0; `npm run test:smoke` → `3/3 checks
passed`. Then, if a human is available for a manual check, note in your report
that the A/B-tab scenario from "Why this matters" should be walked once in a
real browser; do not block on it.

## Test plan

New file `test/highlight-clear.test.ts`, harness modeled on
`test/pending-save.test.ts` (in-memory `chrome.storage.session` stub, `checks`
array, `process.exit`). Stub `chrome.scripting.executeScript` to *record*
calls (`{ target, func }` pushed to an array) instead of returning `[]`.

Cases:

1. `HIGHLIGHT` on tab 7 stores `highlightTabId: 7` in session storage and
   injects into tab 7.
2. `CLEAR_HIGHLIGHT` after highlighting tab 7 — while the panel's active tab
   would be a different tab (the message no longer carries one) — injects the
   clear function into **tab 7** and removes `highlightTabId`.
3. `CLEAR_HIGHLIGHT` with nothing stored injects nothing and still resolves
   `{ ok: true }`.
4. Two `HIGHLIGHT` calls on different tabs then one `CLEAR_HIGHLIGHT` clears
   the most recent tab (the stored id is single-slot; that is the intended
   model — the set path overwrites).

**Verification**: `npm run test:unit` → all pass including 4+ new checks.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm run test:unit` exits 0 with `test/highlight-clear.test.ts` in the chain
- [ ] `npm run build` exits 0; `npm run test:smoke` prints `3/3 checks passed`
- [ ] `grep -n "CLEAR_HIGHLIGHT" src/ -r` shows no sender passing a `tabId`
- [ ] The `CLEAR_HIGHLIGHT` case reads `getHighlightTab()` before nulling it
      (visible in the diff)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts don't match the live code (drift since `6b2f01f`).
- Removing `tabId` from the message surfaces senders other than the three
  listed (an unknown caller depends on per-tab semantics).
- The typecheck after Step 1 fails anywhere outside `App.tsx`.

## Maintenance notes

- The stored id is single-slot by design: at most one highlight exists at a
  time. If multi-highlight is ever added, `HL_KEY` becomes a set and this
  handler iterates it — the tests in `highlight-clear.test.ts` are where that
  contract is pinned.
- Reviewer focus: the ordering in the handler (resolve stored id → clear →
  null), and that `clearHighlight` in `App.tsx` lost its `[tabId]` dependency.
- Related but deferred: the rAF loop's idle cost while a highlight is showing
  (separate perf finding; do not fold it in here).
