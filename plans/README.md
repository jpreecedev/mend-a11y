# Plans

Two kinds of content live here: the **active advisor generation (010–020)**
below, and the historical record of retired plans (001–009 and the animation
pass) further down.

## Advisor generation 010–020 (planned at `6b2f01f`, 2026-08-06)

Produced by a full `improve` audit at v0.8.0 (four category passes:
correctness, security, perf+tests, debt/deps/DX/docs — every finding vetted
against the source before planning). Execute in numeric order unless the
dependency notes say otherwise. Each executor: read the plan fully before
starting, honor its STOP conditions, and update your row when done.

### Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| [010](010-panel-tab-state.md) | Make the panel's per-tab result state track reality | P1 | M | — | DONE 2026-08-06 — merged `734f2aa` (executor `2056e23`). Pure helpers extracted to `hooks/tabResults.ts` (fold reducer with `url\|startedAt` value keys + deletion gated on `!loading`; `shouldResolveForUpdate`; sequencer), `onUpdated` filtered to the active tab, both `setState` paths in `resolve()` token-guarded. 11 new checks in `test/activeTab.test.ts`. Note: smoke suite is 4 checks, not the 3 the plan tables said — plan expectation was stale, suite untouched |
| [011](011-highlight-orphan.md) | Clear the highlight overlay on the tab that actually has it | P1 | S | — | DONE 2026-08-06 — merged (executor `6c59120`). Worker resolves `getHighlightTab()` before nulling; `CLEAR_HIGHLIGHT` carries no tabId; `clearHighlight` is now a stable callback; 10 checks in `test/highlight-clear.test.ts`. Manual A/B-tab walk still worth one human pass |
| [012](012-message-channel-hardening.md) | Validate senders and constrain the dashboard-key relay | P1 | M | — | TODO |
| [013](013-docs-truth-pass.md) | Make the repo's own documents tell the truth | P1 | S | — | DONE 2026-08-06 — merged (executor `31389ad`+`4dedf02`). README privacy describes auto-save honestly (and keeps the true zero-requests-by-default claim); CONTRIBUTING carries the real egress invariant; CLAUDE.md created (69 lines); pnpm files deleted, `packageManager: npm@11.16.0` pinned; contract test gained `EXPECTED_CONTRACT_VERSION` + inverse guard. CODE_OF_CONDUCT link dropped rather than inventing the file |
| [014](014-sync-retry-recovery.md) | Stop a doomed first upload from permanently blocking an audit's save | P1 | S | — | TODO |
| [015](015-audit-lifecycle-tests.md) | Characterization tests around the audit lifecycle | P1 | M | — | TODO |
| [016](016-partial-audit-honesty.md) | Surface partial audits; make partial detection real | P2 | S | 015 | TODO |
| [017](017-verify-engine-ships.md) | Fail the build loudly when the vendored engine is missing | P2 | S | — | REJECTED — the finding's premise was disproven by the plan's own Step-1 reproduction (2026-08-06): with `public/vendor/axe.min.js` removed, `npm run build` already fails loudly (`[crx:manifest-post] ENOENT` from @crxjs/vite-plugin resolving the web_accessible_resources entry), so no silent engine-less zip can reach CI's package step. Residual gaps (hand-edited dist/, truncated-but-present engine file) judged too narrow to plan. No code changed |
| [018](018-panel-self-audit.md) | Audit the auditor: engine run against the panel in smoke | P2 | S | — | IN PROGRESS |
| [019](019-local-export.md) | Local JSON export for keyless users | P3 | S–M | — (sequence after 016) | TODO |
| [020](020-docs-corpus-expansion.md) | Expand the docs corpus beyond the v1 twenty | P3 | M–L | — | DONE 2026-08-06 — merged (executor `6bb9470`+`2280e3e`+`eb0ed36`, one revision round). 35 entries; every before/after verified against the vendored engine via a Puppeteer harness. Two planned rules replaced after verification: `th-has-data-cells` (incomplete-typed — Mend surfaces violations only) and `scrollable-region-focusable` (Safari-only in axe 4.11 per its own description; NOTE: executor's independent probe saw it fire once in headless Chrome where reviewer's probes saw it never match — conflicting evidence, treated as too unreliable to document) → `input-image-alt` + `area-alt`. `input-button-name` example corrected (bare type=submit passes via browser-default name) |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with one-line reason) | REJECTED (with one-line rationale)

### Dependency notes

- **016 requires 015**: the partial-frame predicate change flips two
  characterization checks that 015 writes; changing the predicate untested is
  exactly what 015 exists to prevent.
- **010, 014, 016, 019 all touch `App.tsx` and/or the results screens** in
  disjoint regions; whichever lands later must re-read the live file (each
  plan's drift check says so) rather than trusting quoted line numbers.
- **017 and 018 are complementary, not redundant**: 017 guards the packaging
  path (file exists, plausible size), 018 guards runtime (the engine actually
  runs — against the panel itself).
- 011 slightly reduces churn that 010 also touches (a `clearHighlight`
  dependency); land 011 before or after 010 freely — the overlap is
  one callback's dependency array.

### Findings considered and not planned this round

Recorded so they aren't re-audited from scratch. Fix-worthy but unselected
(available for a future generation): unhandled `sendToWorker` rejections at
~6 panel call sites (settings writes silently lost on worker cold start);
per-node duplication of docs explanations in `AuditResult` (~MB-scale payload
bloat at high issue counts; fix must keep the ingest wire shape); whole-object
settings writes racing the key relay; engine re-injection on every run/re-run
(no `window.axe` probe); highlight rAF loop's 60fps forced-layout read while
idle; unwindowed occurrence lists on group expansion; single `auditDone` flag
lying across concurrent multi-tab audits; dead "Highlight style" setting
(writes a field nothing reads); upload endpoint accepting `http://` with no
host allowlist; page-controlled `helpUrl` rendered as href without a scheme
allowlist; `use_dynamic_url: false` fingerprinting surface; dev-toolchain
`npm audit` highs + the Vite 6→7 major (gated on `@crxjs` peer range); no
linter (type-aware `no-floating-promises` would catch the rejection bugs
mechanically); test-runner consolidation (12 `&&`-chained tsx scripts,
duplicated harnesses — becomes urgent the day UI component tests are wanted);
`App.tsx` decomposition and the 4-way overlay-toggle duplication (blocked on
better test cover first); schema-validating MAIN-world runner results before
caching/upload.

**Rejected outright** (not worth doing, with reasoning):
- Panel bundle-splitting — already route-split; built chunks are small (panel
  entry ~51 KB, docs chunk ~16 KB).
- Type-escape-hatch cleanup — zero `@ts-ignore`/`@ts-expect-error` in `src/`;
  the seven `as unknown as` casts are the unavoidable typed-window pattern
  for injected page functions.
- Integrity-hashing the vendored engine copy — `npm ci` + the lockfile's
  integrity field already pin the package.
- Root-level zips/extracted-dir litter — gitignored working-directory files,
  not repo state. (Caveat noted in audit: the `.gitignore` `mend-a11y-*` glob
  is unanchored and would silently untrack a future `mend-a11y-*` source
  file; narrow it if it ever bites.)
- Replacing the tsx-script test style *as such* — no concrete isolation
  failure found; consolidation is listed above on its own merits, not as a
  correctness fix.

## Retired plans (001–009)

Retired plans are summarized below. The six animation plans from the
`improve-animations` pass at `834f519` were all applied in commit `0acb7a7` and deleted once
verified. This file is what's left: the parts that still have a future.

## Dashboard funnel (007–009)

- **007 — account key relay**: shipped in `6643904` (v0.7.2). Content script on
  `https://mend-a11y.com/account*` relays a freshly generated API key into extension settings via
  `RELAY_DASHBOARD_KEY`; guarded by `test/dashboard-key-relay.test.ts`. To read the full plan:
  `git show 6643904:plans/007-account-key-relay.md`.
- **008 — post-audit account prompt**: shipped 2026-08-06 alongside a change of model the plan
  predates: with a key configured, audits now upload **automatically** after each run (new
  `Settings.autoSync`, default on; turn it off to get the old per-audit Save button back). The
  callout (`AccountPrompt.tsx`) renders on results/pass for keyless users until dismissed
  (`Settings.accountPromptDismissed`), its CTA opens `/signup?from=extension` (the website's half,
  plan 047 there, is live), and the panel's `chrome.storage.onChanged` listener picks up the
  relayed key without a reopen — at which point the current audit posts immediately. Upload state
  is surfaced live per audit (`SyncStatus.tsx`), and `403 AUDIT_CAP` from the ingest contract is
  treated as non-retryable with the portal's message shown verbatim. The plan's copy
  ("only when you choose to") was intentionally not used — the reassure lines and store
  disclosures were updated to describe auto-save honestly instead. Full plan: this file's history
  (`git log --diff-filter=D -- plans/008-account-signup-prompt.md`).
- **009 — save-audit funnel**: shipped 2026-08-06. The callout's CTA is now **Save audit**: it
  stages the finished run tab-independently in `chrome.storage.session` (`STAGE_PENDING_SAVE` →
  `PendingSave` in `storage.ts`) and opens `/login?from=extension`; when `/connect` relays a key,
  `RELAY_DASHBOARD_KEY` stores it and immediately uploads the snapshot from the worker — the run
  no longer depends on which tab the panel is showing, or survives only until the audited tab
  navigates. The relay's response gained `uploaded`, on which the content script (now also matched
  on `https://mend-a11y.com/connect*`) posts `MEND_AUDIT_SAVED` back into the page so `/connect`
  stops waiting. Retryable upload failures keep the snapshot; a 403 `AUDIT_CAP` drops it. Website
  half: `mend-website@da11bad`; the message shapes and `?from=extension` are described in
  `mend-website/contract/README.md` → "The browser handoff". Guarded by
  `test/pending-save.test.ts`, whose keystone check stages, clears the tab cache, then relays and
  asserts the POST still happens. Full plan:
  `git log --diff-filter=D -- plans/009-save-audit-funnel.md`.

To read a deleted plan in full: `git show 0acb7a7:plans/004-modal-enter-exit.md` (and so on for
`001-motion-tokens`, `002-highlight-raf-performance`, `003-toast-interruptibility`,
`005-scope-reduced-motion`, `006-progress-bar-easing`).

## What shipped

Applied 2026-07-17, all six re-verified against the source before deletion:

| Plan | Change | Verified at |
| --- | --- | --- |
| 001 | Motion tokens (`--ap-ease-out`, `--ap-ease-drawer`, `--ap-duration-fast\|base\|slow`) | `panel.css:31-37` |
| 002 | Highlight overlay writes `transform`, skips redundant frames | `highlight.ts:78-108` |
| 003 | Toast keyed by message; single timer held in a ref | `App.tsx:232-240`, `App.tsx:628-632` |
| 004 | Sheets enter/exit on a drawer curve via `[data-state='closing']` | `panel.css:883-926`, `App.tsx:52-64` |
| 005 | Reduced motion scoped to movement, not all feedback | `panel.css:1287-1329` |
| 006 | Indeterminate progress bar loops `linear` | `panel.css:366` |

Plus one follow-up found while auditing the above and fixed in the same pass — see below.

## Outstanding feel checks

**None of the six were ever feel-checked.** They are verified-by-construction, not verified-by-eye —
motion can be mechanically correct and still feel wrong. Highest value first:

1. **Rapid sheet open/close** — open a sheet (Settings, Filters, Outline, Vision) and close-then-reopen
   it inside 250ms. Watch for the sheet being stranded, or a flash of the open sheet on close. The
   snap-to-dismissed bug this would have caught is fixed (below), but the check still stands.
2. **Highlight double-offset** — open an issue detail for an element far down a long page and confirm
   the overlay lands exactly on it. 002 changed `top`/`left` to `transform`; if any offset were
   double-applied the error would be largest here.
3. **Toast sideways lurch** — DevTools → Animations at 10% playback, trigger a toast. It must rise
   straight up while staying centered. Drift means a keyframe lost its `translate(-50%, …)`.

## Fixed: sheets snapped to fully-dismissed when reopened mid-close

`useSheet` (`App.tsx:52-64`) flips `data-state` between `open` and `closing`, and the CSS swapped the
*animation name* (`sheet-in` ⇄ `sheet-out`). CSS keyframes restart from their `0%` step rather than
retargeting, so reopening a part-dismissed sheet snapped it to fully-offscreen first. Measured in
Chrome before the fix — one frame after the reopen the sheet sat at exactly `translateY(100%)`:

```
100ms into close:  translateY(276px)
reopen +1 frame:   translateY(300px)   ← snapped fully offscreen
```

Now a `transform`/`opacity` transition, which retargets from wherever the sheet is, with
`@starting-style` supplying the entry a transition can't run on mount (`panel.css:883-926`). Verified
in Chrome against the real stylesheet: reopening mid-close recovers from the current position instead
of snapping, and under `prefers-reduced-motion` the sheet never translates at any point while opacity
still animates.

`@starting-style` is Chrome 117+; the manifest sets no `minimum_chrome_version` and the side panel API
already requires 114+. The degradation across that gap is graceful — the sheet appears in place rather
than sliding — so it was not worth pinning the manifest.

## Missed opportunities

Additive, not corrective. Each needs its own plan:

- **The PASS stamp never stamps** (`panel.css:836-864`, `PassScreen.tsx:30`). An SVG-turbulence-masked
  eroded ink border, pre-rotated `-8deg`, shown once per clean audit — a rare, high-emotion moment with
  none of the delight budget it's entitled to. An overshoot-and-settle stamp-down is the obvious move.
- **Route changes teleport** (`App.tsx:517-574`). `empty → running → results → detail` all hard-cut.
  Detail is a drill-down from a row — spatially connected UI with nothing explaining where it came
  from. Any fix stays under ~200ms; detail is opened often.
- **Severity tile counts pop in** (`ResultsScreen.tsx:99-117`). Four counts landing at once after a
  scan; a 30–80ms stagger would sequence the reveal without blocking interaction.

## Already correct — don't "fix" these

- No `transition: all`, no `scale(0)`, and no `ease-in` anywhere in the codebase.
- `highlight.ts:72-73` correctly branches `scrollIntoView` on `prefers-reduced-motion`.
- `.outline-spinner` (`panel.css:1157`) uses `linear` for constant rotation — correct.
- `.float`'s `ease-in-out` (`panel.css:270`) is correct: Pip's idle float is a symmetric
  back-and-forth, not a loop with a seam.
- Sheets are edge-anchored and animate on Y, so `transform-origin` needs no fixing.
