# Plan 013: Make the repo's own documents tell the truth (privacy, CONTRIBUTING, CLAUDE.md, lockfiles)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6b2f01f..HEAD -- README.md CONTRIBUTING.md package.json pnpm-lock.yaml pnpm-workspace.yaml test/contract.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (docs, config, and test-assertion changes only — no runtime code)
- **Depends on**: none
- **Category**: docs / dx
- **Planned at**: commit `6b2f01f`, 2026-08-06

## Why this matters

The repo's public documents contain two affirmatively false statements about
its network behavior — the worst kind of stale doc for a privacy-positioned,
store-listed extension:

1. **README "Privacy" says "Nothing is ever uploaded automatically."** Since
   v0.8.0, connecting a dashboard key auto-uploads every audit by default
   (`autoSync: true` in `DEFAULT_SETTINGS`). The README even contradicts
   itself: its feature list (lines 23–26) describes auto-save correctly. The
   Privacy section is exactly the part a privacy-conscious reader jumps to.
2. **CONTRIBUTING bans `fetch` as "a hard product constraint"** — but
   `src/lib/sync.ts:120` makes a `fetch` by design. A contributor (or agent)
   reading it as the rulebook will refuse legitimate sync work or flag shipped
   code as a violation.

Around those, four smaller hygiene items from the same audit: no
CLAUDE.md/AGENTS.md exists (agents onboard from the two wrong documents
above); a stale `pnpm-lock.yaml` + memberless `pnpm-workspace.yaml` sit beside
the authoritative npm lockfile; the README claims `test:unit` runs "three fast
suites" when it runs twelve; and CONTRIBUTING links a `CODE_OF_CONDUCT.md`
that doesn't exist. Also, `test/contract.test.ts` hardcodes the expected
contract version inside a regex, so the assertion can't drift-check anything.

## Current state

- `README.md:46-51` (the false claim — current text):

  > The one exception is entirely in your hands: the optional dashboard. If you
  > enter a dashboard URL and API key in settings, a **Save** button appears on
  > results, and pressing it sends that audit (the page URL, title, and the issues
  > found) to your own Mend account so you can track progress over time. Nothing is
  > ever uploaded automatically, and leaving the settings blank keeps Mend fully
  > offline.

  The accurate model, already stated at `README.md:23-26`: connecting an
  account makes audits save automatically; turning auto-save off in settings
  restores the per-audit Save button; no key ⇒ fully offline. The Save button
  is only rendered when a key is set AND auto-save is off
  (`src/sidepanel/App.tsx:611`: `onSave={syncEnabled && !autoSync ? ... }`).
  `README.md:40-44` (zero requests by default) remains true — keep it.

- `CONTRIBUTING.md:80-83` (current):

  > - The extension makes no network requests. Don't add `fetch`, analytics,
  >   remote fonts, or any outbound call. This is a hard product constraint, not a
  >   preference.

  The real invariant: the **only** outbound request in the codebase is
  `POST {dashboardUrl}/api/ingest` from `src/lib/sync.ts` (line 120), gated on
  a user-supplied API key; no telemetry, no analytics, no remote fonts, no
  third-party endpoints; any new egress is a product decision, not a code
  review call. The wire contract lives at `test/contract/README.md`.

- `CONTRIBUTING.md` last line links `./CODE_OF_CONDUCT.md` — the file does not
  exist (`ls CODE_OF_CONDUCT.md` fails).

- `README.md:100-111` describes `test:unit` as "three fast suites";
  `package.json:20` chains twelve (pipeline, timeout, docs, textSpacing,
  focusOrder, outline, vision, tabState, sync, contract, dashboard-key-relay,
  pending-save).

- Lockfiles: `pnpm-lock.yaml` and `pnpm-workspace.yaml` are tracked but stale
  (last touched 2026-05-31, commit `d9be494`); every script, CI
  (`.github/workflows/ci.yml` uses `cache: npm` + `npm ci`), and the README
  use npm; `package-lock.json` is regenerated every release.
  `pnpm-workspace.yaml` declares no `packages:` list (only an `allowBuilds`
  block) — a workspace with no members.

- `test/contract.test.ts:56-57` (current):

  ```ts
  const readme = readFileSync(`${contractDir}/README.md`, 'utf8');
  ok('CONTRACT_VERSION: 1 is recorded in the copied README', /CONTRACT_VERSION: 1/.test(readme));
  ```

  The `1` is hardcoded in the test; if the portal bumps the contract to 2 and
  the fixtures are re-copied, this line's *intent* (catch an unacknowledged
  bump) silently inverts.

- No `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, or
  `.github/copilot-instructions.md` anywhere (verified against `git ls-files`).

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Typecheck | `npm run typecheck`  | exit 0              |
| Unit tests| `npm run test:unit`  | all suites pass, exit 0 |
| Fresh-install sanity (after lockfile removal) | `npm ci` | exit 0, `public/vendor/axe.min.js` exists after |

## Scope

**In scope**:
- `README.md` (Privacy section + Testing section only)
- `CONTRIBUTING.md` (network bullet + code-of-conduct link only)
- `CLAUDE.md` (create)
- `pnpm-lock.yaml`, `pnpm-workspace.yaml` (delete)
- `package.json` (add `"packageManager"`; no script changes)
- `test/contract.test.ts` (the version assertion only)

**Out of scope**:
- `SUBMISSION.md` — its disclosure copy is already accurate and mirrors the
  live store listing; editing it risks desync with the store console.
- `test/contract/README.md` and `test/contract/fixtures/**` — copies owned by
  the portal repo's update protocol; never hand-edit here.
- Any `src/` file.
- Adding a linter/formatter — noted in the audit, deliberately not bundled
  into this plan.

## Git workflow

- Commit straight to `main` (repo policy). One commit, e.g.
  `Tell the truth in README/CONTRIBUTING, add CLAUDE.md, drop stale pnpm files`.

## Steps

### Step 1: Rewrite the README Privacy exception paragraph

Replace `README.md:46-51` with a paragraph that states, in this order: the
optional dashboard is the single exception and it is entirely opt-in;
connecting an account (URL + API key in settings) turns on **automatic**
upload of each finished audit (page URL, title, issues found) by default;
switching auto-save off in settings replaces that with a per-audit **Save**
button; removing the key (or never adding one) keeps Mend fully offline.
Match the README's existing voice — plain, direct, second person (read lines
38–51 for tone). Keep lines 40–44 untouched.

**Verify**: `grep -n "Nothing is ever uploaded automatically" README.md` → no
matches. `grep -in "auto" README.md | head` shows the Privacy section now
mentioning automatic upload.

### Step 2: Fix the README Testing description

Update `README.md:100-111`: replace the "three fast suites" sentence with a
grouped, accurate description — normalization pipeline; audit
timeout/watchdog; docs-corpus guard; page-helper suites (text spacing, focus
order, outline, vision, tab state); and the sync layer (upload client, pinned
ingest contract with shared fixtures — pointing at `test/contract/README.md`
for the cross-repo update protocol — dashboard key relay, pending save). Keep
it to 3–5 sentences; the enumeration in `package.json` stays the source of
truth.

**Verify**: `grep -n "three fast suites" README.md` → no matches.

### Step 3: Fix CONTRIBUTING

1. Replace the network bullet (lines 80–83) with the real invariant as stated
   in "Current state" above (only egress = the user-configured dashboard
   ingest POST in `src/lib/sync.ts`; nothing else, ever; new egress is a
   product decision; contract at `test/contract/README.md`).
2. Fix the dead link: either drop the code-of-conduct sentence or create a
   standard Contributor Covenant 2.1 `CODE_OF_CONDUCT.md`. **Choose: drop the
   sentence** (smaller diff, no new obligations invented on the maintainer's
   behalf); note in your report that adding the Covenant is a one-file
   follow-up if wanted.

**Verify**: `grep -n "makes no network requests" CONTRIBUTING.md` → no
matches; `grep -n "CODE_OF_CONDUCT" CONTRIBUTING.md` → no matches.

### Step 4: Create CLAUDE.md

Create `CLAUDE.md` at the repo root with exactly these sections (concise —
target 60–90 lines total; link instead of duplicating where a doc already
covers something):

1. **What this is** — MV3 Chrome extension (TypeScript + Preact + Vite/crxjs);
   the three runtime contexts and where each lives: service worker
   (`src/background/service-worker.ts`), in-page MAIN-world runner + injected
   helpers (`src/lib/audit.ts`, `highlight.ts`, `textSpacing.ts`,
   `focusOrder.ts`, `outline.ts`, `vision.ts`), Preact side panel
   (`src/sidepanel/`).
2. **Commands** — `npm` is the package manager (never pnpm); `npm run
   typecheck`; `npm run build` (typecheck + production build); `npm run
   test:unit` (twelve tsx suites, no framework — each suite is a standalone
   script printing `N/N checks passed`); `npm run test:smoke` (Puppeteer,
   needs a build first); `npm run sync-axe` after bumping axe-core.
3. **Invariants** — the egress rule from Step 3, verbatim; the panel must pass
   its own audit (semantics, labels, focus, AA contrast both themes); no CSS
   framework / UI library / state library; never add a `key` field to the
   manifest (`manifest.config.ts` comment + `scripts/package.mjs` guard
   explain why); injected page functions must stay self-contained (no imports,
   no module-scope closures, JSON-serializable args — see the header comment
   in `src/lib/highlight.ts`).
4. **Cross-repo contract** — the ingest payload is duplicated with the
   mend-website repo, pinned by `test/contract/` fixtures; the update protocol
   is in `test/contract/README.md`; never hand-edit the copied fixtures here.
5. **Releasing** — `npm run release:patch|minor|major` (preversion gates
   build+tests, postversion packages the zip); `git push --follow-tags`; the
   zip is uploaded manually in the Web Store dashboard; `SUBMISSION.md` is the
   checklist.
6. **Plans** — `plans/README.md` is the advisor index; executors update their
   status row there.

**Verify**: `test -f CLAUDE.md && wc -l CLAUDE.md` → file exists;
`npm run typecheck` still exits 0 (nothing code-side changed).

### Step 5: Remove the pnpm remnants and pin the package manager

1. `git rm pnpm-lock.yaml pnpm-workspace.yaml`
2. In `package.json`, add a top-level `"packageManager": "npm@<major.minor.patch>"`
   — use the version from `npm --version` on this machine.

**Verify**: `npm ci` → exit 0 and `test -f public/vendor/axe.min.js` succeeds
(postinstall ran); `npm run test:unit` → all pass.

### Step 6: Un-hardcode the contract-version assertion

In `test/contract.test.ts`, extract the expected version to a named constant
with a pointing comment:

```ts
// The contract version this extension build speaks. When the portal bumps
// CONTRACT_VERSION (see test/contract/README.md's update protocol), re-copy
// the contract/ directory and update this constant in the same commit — the
// assertion below is what makes an unacknowledged bump fail loudly here.
const EXPECTED_CONTRACT_VERSION = 1;
```

and assert with it:
`new RegExp(`CONTRACT_VERSION: ${EXPECTED_CONTRACT_VERSION}\\b`).test(readme)`.
Also add the inverse guard: fail if the README contains a `CONTRACT_VERSION:`
line with any *other* number (regex for `CONTRACT_VERSION: (\d+)`, compare the
capture). That is what actually catches a portal-side bump after fixtures are
re-copied.

**Verify**: `npx tsx test/contract.test.ts` → all checks pass, including the
new inverse guard.

## Test plan

No new test files. Step 6 strengthens an existing assertion; Steps 1–5 are
verified by the greps and commands above plus one full `npm run test:unit`.

## Done criteria

- [ ] `grep -rn "Nothing is ever uploaded automatically" README.md` → empty
- [ ] `grep -n "makes no network requests" CONTRIBUTING.md` → empty
- [ ] `CLAUDE.md` exists with the six sections
- [ ] `pnpm-lock.yaml` and `pnpm-workspace.yaml` are deleted;
      `grep -n '"packageManager"' package.json` → one match
- [ ] `npm ci && npm run test:unit` → exit 0
- [ ] `test/contract.test.ts` has no hardcoded version inside a regex literal
      (`grep -n "CONTRACT_VERSION: 1" test/contract.test.ts` → empty)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- README/CONTRIBUTING text at the cited lines differs from the excerpts
  (drift since `6b2f01f`).
- Anything under `test/contract/` other than `test/contract.test.ts` would
  need editing to make Step 6 pass — that means the local contract copy is
  already out of protocol; report it.
- `npm ci` fails after removing the pnpm files (implies something was
  resolving through pnpm after all).

## Maintenance notes

- CLAUDE.md now carries the egress invariant; if the extension ever gains a
  second endpoint, update CLAUDE.md, CONTRIBUTING, and the README privacy
  section in the same commit — they are one claim in three voices.
- The store listing's disclosure copy lives in `SUBMISSION.md`; when privacy
  behavior changes again, that file and the live store console must move
  together (deliberately out of scope here).
- Reviewer focus: the rewritten privacy paragraph must not overclaim in the
  *other* direction — default keyless behavior really is zero requests, and
  that sentence should survive.
