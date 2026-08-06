# Plan 019: Let keyless users export an audit as JSON

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6b2f01f..HEAD -- src/lib/sync.ts src/sidepanel/screens/ResultsScreen.tsx src/sidepanel/screens/PassScreen.tsx src/sidepanel/App.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (Plans 010/014/016 touch `App.tsx`
> and the screens — expect drift in line numbers; STOP only on *shape*
> mismatches in the excerpted code.)

## Status

- **Priority**: P3
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none (sequence after 016 to avoid `ResultsScreen`/`PassScreen`
  merge friction)
- **Category**: direction
- **Planned at**: commit `6b2f01f`, 2026-08-06

## Why this matters

A surface asymmetry: audits can leave the extension *only* via the dashboard
account path (`uploadAudit` → `/api/ingest`). A keyless user — the
privacy-first persona the README leads with — has no way to get an audit out
of the panel at all; the single clipboard affordance in the product copies a
code example in issue detail. Yet the complete, serializable representation
of an audit already exists: `buildIngestPayload(result, pageTitle)` in
`src/lib/sync.ts` produces exactly the JSON the portal ingests, pinned by the
contract fixtures. Reusing it for a local "Export JSON" button gives users a
machine-readable audit for tickets, diffing, or their own tooling — at near-zero
marginal cost and with a shape that is already documented and versioned.
Deliberate scope cut, founder-confirmable later: JSON only, no HTML/PDF
report (that is a different product decision with real design cost).

## Current state

- `src/lib/sync.ts:72-98` — `buildIngestPayload` + `toIngestIssue`; pure
  functions over `AuditResult`. Contract: `test/contract.test.ts:59-62`
  asserts the payload reproduces `test/contract/fixtures/valid/canonical.json`
  byte-for-byte. **Reuse, do not modify.**
- `src/sidepanel/screens/ResultsScreen.tsx:89-112` — the `head-actions`
  button row: Re-run, Filters, conditional Save (`onSave &&` — present only
  when a key is set and auto-save off), conditional `SyncStatus`. Buttons use
  `class="btn small"` with an icon from `../components/Icon` (e.g.
  `<RefreshIcon size={14} />`).
- `src/sidepanel/screens/PassScreen.tsx:52-69` — `btn block` buttons for
  Re-run / Save on the pass state.
- `src/sidepanel/App.tsx` — screens receive callbacks as props (see
  `onRerun={() => void runAudit()}` at ~609/620); `result` for the active tab
  is in scope there; the tab's title is NOT currently fetched by the panel —
  the worker resolves it at save time via `chrome.tabs.get(tabId)`
  (`service-worker.ts:311`).
- Download mechanics in an MV3 side panel: the panel is a normal extension
  page — `URL.createObjectURL(new Blob([json], { type: 'application/json' }))`
  plus a temporary `<a download="...">` click works without any new
  permission. Do NOT add the `downloads` permission (`chrome.downloads` is
  unnecessary for this and permissions changes trigger store re-review).
- Icon inventory: `src/sidepanel/components/Icon.tsx` — check whether a
  download-ish icon exists (`grep -n "export function" src/sidepanel/components/Icon.tsx`);
  `UploadIcon` exists (used by Save). If no download icon, add one small SVG
  component there matching the existing icons' 24-viewBox stroke style.

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Typecheck | `npm run typecheck`  | exit 0              |
| Unit tests| `npm run test:unit`  | all suites pass, exit 0 |
| Build+smoke | `npm run build && npm run test:smoke` | all checks pass |

## Scope

**In scope**:
- `src/sidepanel/export.ts` (create — filename + payload assembly, pure)
- `src/sidepanel/App.tsx` — one callback + prop wiring
- `src/sidepanel/screens/ResultsScreen.tsx`, `PassScreen.tsx` — one button each
- `src/sidepanel/components/Icon.tsx` — a download icon if none exists
- `test/export.test.ts` (create); `package.json` — append to `test:unit`

**Out of scope**:
- `src/lib/sync.ts` and everything under `test/contract/` — the payload
  builder and its contract are frozen from this plan's perspective.
- Any new permission in `manifest.config.ts`.
- HTML/PDF/report rendering, and CSV (flat-file lossy; the JSON carries
  everything — someone can flatten downstream).
- The issue-detail copy button and `IssueDetailScreen.tsx`.

## Git workflow

- Commit straight to `main` (repo policy). One commit, e.g.
  `Add local JSON export of an audit from the results and pass screens`.

## Steps

### Step 1: The export module

Create `src/sidepanel/export.ts`:

- `export function exportFileName(url: string, startedAt: number): string` —
  `mend-audit-<host>-<YYYYMMDD-HHmm>.json`, host from `new URL(url).hostname`
  with a `'page'` fallback for unparseable urls, timestamp from `startedAt`
  (local time, zero-padded). Keep it filesystem-safe: strip characters
  outside `[a-z0-9.-]` from the host.
- `export function exportAudit(result: AuditResult, pageTitle: string): { name: string; json: string }` —
  wraps the reused builder:

  ```ts
  import { buildIngestPayload } from '../lib/sync';
  // The export IS the ingest payload: one audit shape everywhere, pinned by
  // test/contract. Add export-only metadata under `exportedAt`/`extension`
  // keys ONLY if a future need is proven — today, byte-parity with the
  // contract is worth more than provenance fields.
  const json = JSON.stringify(buildIngestPayload(result, pageTitle), null, 2);
  ```

- `pageTitle`: the panel does not have the tab title; pass `result.url` as
  the title fallback exactly as the worker does (`tab?.title ?? result.url` —
  `service-worker.ts:313`). To get the real title, the App callback should
  `chrome.tabs.get(tabId)` with a `.catch(() => null)` and fall back — same
  pattern, panel-side.

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Wire the button

In `App.tsx`, add `exportAudit` callback (guard `result != null`; resolve
title; build blob; `URL.createObjectURL`; create `<a>` with `download` =
`exportFileName(...)`; click; `URL.revokeObjectURL` in a `setTimeout(…, 0)`).
Pass it as `onExport` to `ResultsScreen` and `PassScreen`.

In `ResultsScreen.tsx` `head-actions` (after Filters, before Save): a
`btn small` button — icon + label `Export`. In `PassScreen.tsx`: a
`btn block` button labelled `Export JSON`, after Re-run. **The button renders
unconditionally** (the whole point is keyless availability) — do not gate it
on `syncEnabled`.

Accessibility bar (the panel audits itself — plan 018 may already enforce
it): real `<button>`, discernible text, no title-only labeling.

**Verify**: `npm run typecheck` → exit 0; `npm run build && npm run
test:smoke` → all checks pass (if plan 018 landed, the self-audit now checks
your new button).

### Step 3: Tests

`test/export.test.ts` (tsx-script harness, model `test/sync.test.ts` — it
already builds `AuditResult` fixtures for `buildIngestPayload`):

1. `exportFileName('https://app.example.com/x', <fixed ts>)` →
   `mend-audit-app.example.com-<expected stamp>.json`.
2. Unparseable url → host falls back to `page`.
3. `exportAudit(result, 'Title').json` parses, and `JSON.parse(json)` deep-equals
   `buildIngestPayload(result, 'Title')` (parity pin — the export must never
   fork from the contract shape silently).
4. The JSON is pretty-printed (`json.includes('\n  ')`) — diffs are a stated
   use case.

Append `tsx test/export.test.ts` to `test:unit`.

**Verify**: `npm run test:unit` → all pass.

## Test plan

Covered in Step 3; DOM-side download mechanics are untestable in this repo's
harness (no DOM lib — known gap) and are covered by typecheck + smoke +
review. Say so in the report.

## Done criteria

- [ ] Export button present on Results AND Pass screens with no key configured
      (code-visible: `onExport` prop is not conditioned on `syncEnabled` —
      `grep -n "onExport" src/sidepanel/App.tsx` shows unconditional wiring)
- [ ] `test/export.test.ts` in the chain; parity check (case 3) present
- [ ] `npm run typecheck` && `npm run test:unit` exit 0
- [ ] `npm run build && npm run test:smoke` → all checks pass
- [ ] No new permissions in the built `dist/manifest.json`
      (`grep -n "downloads" dist/manifest.json` → empty)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpted `head-actions` structure has changed shape (plan 016 adds a
  banner nearby) in a way that makes button placement ambiguous — reconcile
  visually, and STOP only if the row overflows the panel's narrow width
  (that's a layout decision).
- You find yourself wanting to modify `buildIngestPayload` (e.g. to add
  export metadata) — the parity pin is the contract; adding fields is a
  cross-repo conversation.
- `URL.createObjectURL` is unavailable in the side-panel context of the
  installed Chrome (would surprise; report, don't work around with
  `chrome.downloads`).

## Maintenance notes

- The export shape is the ingest contract; when `CONTRACT_VERSION` bumps, the
  export follows automatically — which is exactly why the parity test exists.
  If provenance fields (`exportedAt`, extension version) are ever added,
  wrap the payload (`{ meta, audit }`) rather than polluting the contract
  object, and update the parity test deliberately.
- A future "import into dashboard" (the portal's parked JSON-import idea in
  its own plans index) would consume exactly this file — keep the filename
  stamp format stable once shipped.
- Reviewer focus: revocation of the object URL; filename sanitization; the
  button NOT appearing disabled/hidden for keyless users.
