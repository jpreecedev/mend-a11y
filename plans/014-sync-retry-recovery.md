# Plan 014: Stop a doomed first upload from permanently blocking an audit's save

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6b2f01f..HEAD -- src/sidepanel/App.tsx src/sidepanel/screens/SettingsScreen.tsx src/sidepanel/components/Controls.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (touches different `App.tsx` regions than plan 010;
  whichever lands second must re-read the live file)
- **Category**: bug
- **Planned at**: commit `6b2f01f`, 2026-08-06

## Why this matters

A user who **types** their API key into settings (instead of pasting it)
triggers this chain: the key field commits on every keystroke → after the
first character `syncConfigured()` is true → the auto-sync effect uploads the
on-screen audit with a one-character key → the portal answers 401 → the panel
records `{ phase: 'error', retryable: false }` under that audit's key → the
auto-sync effect forever skips that audit (`if (syncStates[auditKey]) return`)
→ and because auto-save is on, the manual Save button isn't rendered, and the
non-retryable error chip is a non-interactive span. Net: a guaranteed "The
dashboard rejected the API key" toast during typing, and the finished audit on
screen can never be saved — the only recovery is re-running the audit. This
breaks the exact funnel the last three releases built.

Two fixes, both panel-side: commit the key on blur (stop uploading
mid-keystroke), and re-arm blocked audits when the key changes.

## Current state

Files:

- `src/sidepanel/App.tsx` — auto-sync effect (493–500), sync state map
  (line 92), `auditKey` derivation (459), `uploadForTab` (462–491).
- `src/sidepanel/screens/SettingsScreen.tsx` — the key field (85–92), `set()`
  helper (~19–20) which writes the whole settings object on every change.
- `src/sidepanel/components/Controls.tsx` — `TextField` (107–147), commits via
  `onInput` (line 138).
- `src/lib/sync.ts` — read-only context: 401 → `SyncError` with
  `retryable: false` (135–140).
- `src/sidepanel/components/SyncStatus.tsx` — read-only context: non-retryable
  error renders a non-interactive span (47–52).

`src/sidepanel/App.tsx:493-500` (current):

```tsx
  // Auto-upload: any finished audit on the active tab that hasn't been sent
  // (or refused) yet goes up as soon as sync is on. Firing on settings changes
  // too is what makes a freshly entered or relayed key post the current audit.
  useEffect(() => {
    if (!autoSync || tabId == null || auditKey == null) return;
    if (syncStates[auditKey]) return;
    void uploadForTab(tabId, auditKey);
  }, [autoSync, tabId, auditKey, syncStates, uploadForTab]);
```

`src/sidepanel/screens/SettingsScreen.tsx:85-92` (current):

```tsx
      <TextField
        label="Dashboard API key"
        type="password"
        value={settings.dashboardApiKey}
        placeholder="mend_…"
        desc="Optional. Generate one on your mend-a11y.com account page. With a key set, audits save to your dashboard when they finish."
        onChange={(v) => set('dashboardApiKey', v)}
      />
```

`src/sidepanel/components/Controls.tsx:129-139` (current — the input):

```tsx
      <input
        id={id}
        class="text-input"
        type={type}
        value={value}
        placeholder={placeholder}
        autocomplete="off"
        spellcheck={false}
        aria-describedby={descId}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
      />
```

Repo conventions: `TextField` is shared by other screens — do not change its
default behavior for all callers; add an opt-in. Comments explain why, in
full sentences. The whole `settings` object is persisted per change via
`SET_SETTINGS` (a known, separate coarseness issue — out of scope here).

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Typecheck | `npm run typecheck`  | exit 0              |
| Unit tests| `npm run test:unit`  | all suites pass, exit 0 |
| Build+smoke | `npm run build && npm run test:smoke` | `3/3 checks passed` |

## Scope

**In scope**:
- `src/sidepanel/components/Controls.tsx` — `TextField` gains an opt-in
  `commitOn="blur"` mode
- `src/sidepanel/screens/SettingsScreen.tsx` — the key field uses it
- `src/sidepanel/App.tsx` — the auto-sync guard and sync-state re-arm
- `test/sync-rearm.test.ts` (create)
- `package.json` — append the new suite to `test:unit`

**Out of scope**:
- `src/lib/sync.ts` — 401 being non-retryable is correct (retrying the same
  bad key cannot help; a *changed* key is what re-arms).
- `src/sidepanel/components/SyncStatus.tsx` — the non-interactive chip for
  permanent errors stays; recovery comes from the key change, not the chip.
- The worker (`service-worker.ts`) and message shapes.
- Whole-object settings persistence (`SET_SETTINGS` coarseness) — separate
  known issue.

## Git workflow

- Commit straight to `main` (repo policy). One commit, e.g.
  `Commit the API key on blur and re-arm uploads when the key changes`.

## Steps

### Step 1: Give `TextField` an opt-in blur-commit mode

In `src/sidepanel/components/Controls.tsx`, add an optional prop
`commitOn?: 'input' | 'blur'` (default `'input'`, preserving every existing
caller). In blur mode: keep the in-progress value in local state
(`useState`), sync it from the `value` prop when the prop changes (compare
against the last-committed value so a background settings refresh doesn't
stomp active typing), and call `onChange` on `blur` and on `Enter`. The
password `type` and a11y attributes stay as they are.

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Use it for the API key field

In `src/sidepanel/screens/SettingsScreen.tsx`, pass `commitOn="blur"` to the
"Dashboard API key" `TextField` only. (Leave any other TextField callers
alone — `grep -rn "<TextField" src/sidepanel/` to confirm the full caller
list; at `6b2f01f` the key field is the only one, but verify.)

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Re-arm blocked uploads when the key changes

In `src/sidepanel/App.tsx`, make the sync-state guard key-aware. Minimal
approach that preserves the existing state shape: add an effect that clears
error entries when the API key changes —

```tsx
  // A changed key invalidates previous refusals: a 401 recorded under the old
  // key must not block the new key from trying. Synced/uploading entries stay —
  // re-sending those would duplicate, and the portal's duplicate check is not
  // a license to spam it.
  const apiKey = settings.dashboardApiKey;
  useEffect(() => {
    setSyncStates((prev) => {
      const next: typeof prev = {};
      let changed = false;
      for (const [k, v] of Object.entries(prev)) {
        if (v.phase === 'error') changed = true;
        else next[k] = v;
      }
      return changed ? next : prev;
    });
  }, [apiKey]);
```

Place it adjacent to the existing auto-sync effect (493–500), which then
needs no change: with the error entry gone, its `if (syncStates[auditKey])
return` guard passes and the upload re-fires with the new key. Note the
effect must not run on mount in a way that wipes legitimate state — on mount
`syncStates` is `{}`, so the no-op path (`changed === false` returns `prev`)
already covers it.

**Verify**: `npm run typecheck` → exit 0.

### Step 4: Tests + full gate

Create `test/sync-rearm.test.ts` per the Test plan; append to `test:unit`.

**Verify**: `npm run test:unit` → all pass; `npm run build && npm run
test:smoke` → `3/3 checks passed`.

## Test plan

Panel components have no render-test infrastructure, so — as with plan 010 —
extract the pure logic and test it with the repo's standard tsx-script
harness (model: `test/pending-save.test.ts`'s `checks`/`ok` pattern, no
chrome stub needed here):

- From Step 3, extract `clearErrorEntries(prev: Record<string, SyncInfo>):
  Record<string, SyncInfo>` into `src/sidepanel/components/SyncStatus.tsx`'s
  module or a small new `src/sidepanel/syncState.ts` (prefer the latter;
  import it from `App.tsx`). Test: error entries dropped; synced/uploading
  entries kept; object identity preserved when nothing to drop.
- From Step 1, extract the blur-commit decision if you implemented any
  non-trivial reconciliation (e.g. `resolveFieldValue(propValue,
  lastCommitted, draft)`); if the implementation stayed trivial (local state +
  onblur), state that in the report and skip this case.

Cases:

1. `{ a: error(retryable:false), b: synced }` → `{ b: synced }`.
2. `{ a: uploading }` → identity-equal same object.
3. `{}` → identity-equal same object.

**Verification**: `npx tsx test/sync-rearm.test.ts` → `N/N checks passed`.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm run test:unit` exits 0; `test/sync-rearm.test.ts` in the chain
- [ ] `grep -n "commitOn" src/sidepanel/components/Controls.tsx src/sidepanel/screens/SettingsScreen.tsx`
      → present in both (definition + the key field's usage)
- [ ] `npm run build && npm run test:smoke` → `3/3 checks passed`
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts don't match the live code — in particular if plan 010 landed
  first, re-read `App.tsx` around the sync effects and reconcile line numbers
  before editing; if the *shape* of the guard changed (not just line numbers),
  report instead of adapting silently.
- `TextField` turns out to have callers relying on per-keystroke commits for
  the key field specifically (e.g. a live validation effect you find in
  `SettingsScreen.tsx`).
- Clearing error entries re-triggers an upload loop in manual reasoning (the
  auto-sync effect must only fire when the *key text actually changed* — if
  you observe `settings` object identity churning without text changes, STOP
  and report; that interacts with the storage-echo issue documented in the
  audit).

## Maintenance notes

- The "changed key clears refusals" rule is now load-bearing for funnel
  recovery; if sync-state ever moves out of component state (e.g. to session
  storage), carry the rule with it.
- Reviewer focus: Step 1 must not alter default TextField behavior for future
  callers; Step 3's effect must depend on the key *string*, not the settings
  object identity.
- Deferred: debouncing `SET_SETTINGS` persistence per keystroke for other
  fields (separate coarseness issue), and any UI affordance on the permanent
  error chip.
