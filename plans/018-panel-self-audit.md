# Plan 018: Audit the auditor — run the engine against the panel in the smoke test

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6b2f01f..HEAD -- test/smoke.mjs src/sidepanel/ src/styles/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (test-only; the risky part is discovering real violations —
  which is the point)
- **Depends on**: none
- **Category**: direction / tests
- **Planned at**: commit `6b2f01f`, 2026-08-06

## Why this matters

The README's product claim: "It holds itself to the same bar. The panel is
built to pass the same accessibility checks it reports." `SUBMISSION.md`'s
validation checklist admits the gap: "Run Lighthouse's accessibility audit on
the side panel itself and get it to 100. **This is the one core promise that
has never been measured.**" — and that box is unchecked. The repo already
contains everything needed to measure it forever instead of once: Puppeteer
(devDependency, drives the smoke test) and the vendored axe engine
(`public/vendor/axe.min.js`). This plan makes the smoke test inject the
engine into the panel page and fail CI on any violation, converting the
marketing claim into an enforced invariant. It also closes a second smoke-test
gap for free: today an engine-less or render-broken build passes smoke; a real
engine run cannot pass without a working engine file.

## Current state

- `test/smoke.mjs` — 79 lines; launches headful Chrome with the built
  extension, opens `chrome-extension://<id>/src/sidepanel/index.html`, and
  asserts exactly three things (lines 55–61): `.brand` contains "Mend", a
  `<button>` exists, zero uncaught page errors. Console errors are collected
  but only warned (line 64). Harness: `checks` array + `ok()` + pass-count +
  `process.exit`, same as the unit suites.
- The engine file in the built extension: `dist/vendor/axe.min.js`. From
  Puppeteer, the panel page can be handed the engine two ways; use
  `page.addScriptTag({ path: resolve(DIST, 'vendor/axe.min.js') })` — no
  network, no CSP interaction with remote origins (extension pages allow
  their own resources; if the extension-page CSP rejects the inline/injected
  tag, the fallback is `page.evaluate` of the file's text — decide by trying,
  Step 2's verify shows which worked).
- Running the engine in-page: `await page.evaluate(() => window.axe.run(document, { resultTypes: ['violations'] }))` —
  same call shape the extension itself uses (`src/lib/audit.ts:25-32`,
  including `runOnly` tags; for the panel use no `runOnly` restriction — the
  full default ruleset is the stricter, correct bar for our own UI).
- Theming: the panel styles both light and dark (`src/styles/panel.css`,
  `useThemeClass` in `src/sidepanel/hooks/theme.ts` driven by
  `settings.theme`, default `'auto'`). Contrast violations can differ by
  theme, and the README claims AA "in both themes" — audit both by emulating
  `prefers-color-scheme` (`page.emulateMediaFeatures`).
- The smoke test currently audits only the empty state (no audit has run in
  the panel). That is the honest v1 scope: the empty state + its real
  controls. Auditing the results screen requires driving a full audit — out
  of scope here (needs fixture-page infrastructure; noted in maintenance).

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Build     | `npm run build`      | exit 0              |
| Smoke     | `npm run test:smoke` | all checks pass (now more than 3), exit 0 |
| CI parity | `xvfb-run -a npm run test:smoke` | same, on Linux only — macOS runs it headful |

## Scope

**In scope**:
- `test/smoke.mjs`
- `src/sidepanel/**` and `src/styles/panel.css` — ONLY to fix violations the
  new check finds (Step 4), each fix minimal and named in the report

**Out of scope**:
- `test/` unit suites, `package.json` scripts (smoke is already wired).
- Auditing the results/detail screens (needs an end-to-end audit flow in
  Puppeteer — deferred, see maintenance notes).
- Lighthouse itself — the axe engine run is the enforceable equivalent of
  Lighthouse's a11y category (Lighthouse embeds axe); do not add a Lighthouse
  dependency.

## Git workflow

- Commit straight to `main` (repo policy). If Step 4 requires panel fixes,
  two commits: fixes first (`Fix panel violations found by the self-audit`),
  then the test (`Enforce the panel's own audit in the smoke test`) — so the
  test lands green.

## Steps

### Step 1: Extract a helper and keep existing checks intact

In `test/smoke.mjs`, after the existing three checks, add a
`selfAudit(page, label)` async helper: inject the engine file, run
`window.axe.run(document, { resultTypes: ['violations'] })`, and return the
violations array. Keep everything existing untouched.

**Verify**: `npm run build && npm run test:smoke` → still passes (helper
defined, not yet asserted).

### Step 2: Audit light and dark, assert zero violations

Call the helper twice:

1. `await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])` → `selfAudit(page, 'light')`
2. same with `'dark'` → `selfAudit(page, 'dark')`

For each, `ok(`panel self-audit (${label}): zero violations`,
violations.length === 0)`, and when non-empty, print each violation's `id`,
`impact`, and node `target`s before the summary line (the failure output must
name what to fix — follow the existing `[smoke]` log prefix style).

**Verify**: `npm run test:smoke` → runs 5+ checks; note which pass. If the
new checks fail, continue to Step 4 — a failure here is the finding, not a
test bug (but eyeball the violation ids first: see STOP conditions).

### Step 3: Promote console errors to a check

The audit claim aside, a panel that logs errors on every render currently
passes smoke. Add: `ok('no console errors', consoleErrors.length === 0)` —
they're already collected (line 49). Keep the existing print.

**Verify**: `npm run test:smoke` → passes (if it fails on a pre-existing
console error, that error is a real finding: fix it under Step 4's rules or
STOP if non-trivial).

### Step 4: Fix what the self-audit found (if anything)

For each violation: smallest possible fix in the panel markup/styles, matching
the conventions in `CONTRIBUTING.md` ("real `<button>`/`<a>` elements, labels
on inputs, `aria-*` where roles need it, visible focus, AA contrast in both
themes" — no CSS framework, tokens live in `src/styles/panel.css`). List
every fix in your report with the violation id it closes.

**Verify**: `npm run test:smoke` → ALL checks pass in both themes.

## Test plan

This plan is itself a test. Its regression value: any future panel change
that breaks semantics, labels, focusability, or AA contrast in either theme
fails CI (`.github/workflows/ci.yml` already runs smoke under xvfb on every
push). No unit-test files change.

## Done criteria

- [ ] `test/smoke.mjs` audits the panel with the shipped engine in light AND
      dark, asserting zero violations
- [ ] Console errors are a failing check, not a warning
- [ ] `npm run build && npm run test:smoke` → all checks pass
- [ ] Any panel fixes are separately committed and enumerated in the report
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated; if all green, note in the report
      that `SUBMISSION.md`'s "never been measured" checkbox statement is now
      obsolete (updating SUBMISSION.md itself is the maintainer's call — it
      mirrors store-console state)

## STOP conditions

- The extension-page CSP blocks both engine-injection routes
  (`addScriptTag(path)` and `evaluate(fileText)`) — report the exact error;
  do not weaken the CSP in the manifest to make the test pass.
- The self-audit reports > 5 distinct violation ids, or any fix requires
  restructuring a screen (beyond attributes/labels/colors/focus styles) —
  that is a redesign decision, not a smoke-test fix.
- A violation is a false positive from axe running on an extension page
  (e.g. `html-has-lang` on the panel document is legitimately fixable — but
  if you believe a rule genuinely misfires in this context, report it with
  reasoning INSTEAD of adding a rule exclusion silently; the exclusion list,
  if any, must be argued in the report and commented in the test).

## Maintenance notes

- The check covers the empty/settings-visible state. Extending coverage to
  the results screen needs a driven audit against a fixture page — a natural
  follow-up once someone builds the fixture harness; keep `selfAudit()`
  reusable for it.
- If a deliberate design choice ever conflicts with a rule, the exclusion
  goes in the test with a comment citing the decision — never by dropping the
  whole check.
- Reviewer focus: the dark-theme emulation actually flips the panel's theme
  (verify `useThemeClass` honors `prefers-color-scheme` under `'auto'`), and
  failure output is actionable (ids + targets printed).
