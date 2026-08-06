# Plan 017: Fail the build loudly when the vendored engine is missing

> **REJECTED 2026-08-06** — executed as far as Step 1, which disproved the
> premise: `npm run build` already fails loudly without the engine
> (`[crx:manifest-post] ENOENT: Could not load manifest asset
> "vendor/axe.min.js"` from @crxjs/vite-plugin). The audit finding assumed a
> silent pass; the reproduction showed a hard build failure, so CI cannot
> ship an engine-less zip. Kept as the record; see plans/README.md.

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6b2f01f..HEAD -- scripts/package.mjs scripts/sync-axe.mjs vite.config.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (build tooling only; can only turn silent breakage loud)
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `6b2f01f`, 2026-08-06

## Why this matters

The one artifact that makes the product work — the vendored engine at
`public/vendor/axe.min.js` (~564 KB) — is the one artifact nothing verifies:

- It is gitignored, so a fresh clone has no copy; it exists only if the
  `postinstall` hook ran.
- `scripts/sync-axe.mjs` exits **0** with a warning when `axe-core` isn't in
  `node_modules` — correct for the genuine install-ordering case, but it
  means `npm ci --ignore-scripts` (hardened CI, corporate registries)
  produces a green typecheck, green build, green smoke test (which never runs
  an audit), and a packaged zip in which **every audit silently fails at
  runtime** (`runAxeInPage` returns an empty result when `window.axe` is
  absent — `src/lib/audit.ts:22-23` — so a broken build even shows "PASSED").
- `scripts/package.mjs` guards manifest/key/version/source-maps but never
  checks `dist/vendor/axe.min.js` exists.

First reproduce the failure (the audit marked this MED confidence —
inferred, not observed), then close it at both gates.

## Current state

- `scripts/sync-axe.mjs` (entire file is 20 lines; current):

```js
const src = resolve(root, 'node_modules/axe-core/axe.min.js');
const dest = resolve(root, 'public/vendor/axe.min.js');

if (!existsSync(src)) {
  console.warn('[sync-axe] axe-core is not installed yet; skipping copy. Run "npm run sync-axe" after install completes.');
  process.exit(0);
}

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log('[sync-axe] copied axe.min.js -> public/vendor/axe.min.js');
```

- `scripts/package.mjs` — `fail(message)` helper at lines 19–22
  (`console.error` + `process.exit(1)`); existing guard sequence: dist exists
  (25–27), manifest exists (30–33), no `key` (38–43), version match (44–51),
  source-map scan (53–59), then zips. Follow that structure and message tone.
- The manifest declares the engine as a web-accessible resource
  (`manifest.config.ts:62-68`) and `src/lib/audit.ts:188-211` injects it by
  the literal path `vendor/axe.min.js` — so the built location is
  `dist/vendor/axe.min.js`.
- `public/vendor/axe.min.js` at `6b2f01f` is 564,211 bytes (axe-core 4.11.x);
  a plausible floor for "real engine, not a stub/truncation" is 400 KB.
- CI (`.github/workflows/ci.yml`) runs `npm ci` (scripts enabled) → typecheck
  → build → unit → smoke → zips dist. No change needed there IF package-time
  and build-path guards cover the gap — see Step 4's decision point.

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Reproduce | see Step 1           | documented outcome  |
| Build     | `npm run build`      | exit 0              |
| Package   | `npm run package`    | writes `mend-a11y-<version>.zip`, prints the guard lines |
| Unit tests| `npm run test:unit`  | all suites pass     |
| Smoke     | `npm run test:smoke` | `3/3 checks passed` |

## Scope

**In scope**:
- `scripts/sync-axe.mjs`
- `scripts/package.mjs`

**Out of scope**:
- `test/smoke.mjs` — extending smoke to run a real audit is plan 018's
  territory (the panel self-audit); do not duplicate it here.
- `.github/workflows/ci.yml` — only touch if Step 4's decision point says so.
- `vite.config.ts`, `manifest.config.ts`, anything in `src/`.
- Integrity hashing of the copied engine — rejected in the audit: `npm ci`
  plus the lockfile's integrity field already pin the package.

## Git workflow

- Commit straight to `main` (repo policy). One commit, e.g.
  `Refuse to package a build without the vendored engine`.

## Steps

### Step 1: Reproduce the silent failure

In a scratch clone or after backing up the file (do NOT rely on git restore
of an ignored file — it isn't tracked):

```bash
mv public/vendor/axe.min.js /tmp/axe.backup.js
npm run build && npm run package && echo "SILENT: packaged without engine"
mv /tmp/axe.backup.js public/vendor/axe.min.js
```

Record the outcome in your report. Expected: build and package both succeed
(the silent failure confirmed). If either already fails loudly, the audit's
inference was wrong — STOP and report (the fix may be unnecessary or
different).

Note: check whether `npm run build` (vite + crxjs) errors on the missing
web-accessible resource; crxjs versions differ here. Whatever you observe IS
the finding — document it.

### Step 2: Make `sync-axe.mjs` distinguish "not yet" from "failed"

Keep exit 0 ONLY for the genuine ordering case (running as `postinstall`
before `axe-core` extraction — detectable as: `node_modules` itself missing
or `node_modules/axe-core` missing while `npm_lifecycle_event ===
'postinstall'`). For a manual `npm run sync-axe` invocation with `axe-core`
absent, exit **1** with an instruction to run `npm install`. If the copy
itself throws, let it throw (non-zero). Add a size sanity check: after
copying, `statSync(dest).size > 400_000` or exit 1 naming the actual size.

**Verify**: `npm run sync-axe` → exit 0, prints the copied line.
`node -e "process.env.npm_lifecycle_event=''" && mv node_modules/axe-core /tmp/axe-core.bak && npm run sync-axe; echo "exit: $?"; mv /tmp/axe-core.bak node_modules/axe-core`
→ `exit: 1`.

### Step 3: Add the package-time guard

In `scripts/package.mjs`, after the version-match guard (line 51) and before
the source-map scan, add:

```js
// The engine is the product. A dist without it builds, smokes, and zips
// green — and every audit silently returns empty. Refuse to ship it.
const enginePath = join(distDir, 'vendor', 'axe.min.js');
if (!existsSync(enginePath)) {
  fail(
    'dist/vendor/axe.min.js is missing. The vendored engine did not reach the ' +
      'build — run `npm run sync-axe` (or a full `npm install`) and rebuild.',
  );
}
const engineSize = statSync(enginePath).size;
if (engineSize < 400_000) {
  fail(
    `dist/vendor/axe.min.js is ${engineSize} bytes — too small to be the real ` +
      'engine. Re-run `npm run sync-axe` and rebuild.',
  );
}
```

Also add the engine's size to the success log lines at the bottom, matching
their format.

**Verify**: `npm run build && npm run package` → succeeds, log mentions the
engine. Then re-run Step 1's reproduction: with the engine file moved away,
`npm run package` (against the engine-less dist) → exits 1 with the new
message. Restore the file, rebuild.

### Step 4: Decision point — is CI covered?

CI zips `dist/` directly (workflow lines 37–45) *without* running
`package.mjs`, so Step 3 does not guard the CI artifact. If Step 1 showed the
**build** already fails without the engine, CI is covered and nothing more is
needed — record that. If the build passed silently, add the minimal check to
CI: a step after Build —

```yaml
      - name: Verify vendored engine shipped
        run: test -s dist/vendor/axe.min.js
```

(This is the one case where `.github/workflows/ci.yml` enters scope; keep it
to exactly this step.)

**Verify**: push-independent — `test -s dist/vendor/axe.min.js` locally →
exit 0.

## Test plan

No unit-test file: both scripts are process-boundary tools; their guards are
exercised by the Step 1–3 verification commands, which your report must show
(command + observed exit codes). The full existing gate
(`npm run test:unit && npm run build && npm run test:smoke && npm run
package`) must end green.

## Done criteria

- [ ] Step 1's reproduction outcome documented in the report
- [ ] `scripts/sync-axe.mjs`: manual invocation without axe-core exits 1;
      postinstall-ordering case still exits 0
- [ ] `scripts/package.mjs` refuses an engine-less or undersized dist (shown
      by the Step 3 negative test)
- [ ] `npm run build && npm run package && npm run test:unit && npm run test:smoke`
      all exit 0 on the intact tree
- [ ] CI decision recorded; workflow modified only if the build was silent
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Step 1 shows the failure is NOT silent (build or package already fails) —
  the premise changed; report before adding guards.
- The postinstall-ordering detection can't be made reliable (e.g.
  `npm_lifecycle_event` absent in this npm version) — report with the
  observed env rather than shipping a guard that breaks `npm install`.

## Maintenance notes

- The 400 KB floor is calibrated to axe-core 4.11 (564 KB); if a future axe
  major halves its size, this trips — the failure message names the size, so
  the fix is a one-line threshold bump. Deliberate: a tripwire that
  occasionally asks a human beats one that never fires.
- Plan 018 (panel self-audit in smoke) adds the runtime-level engine check
  (an actual audit run in CI); these are complementary layers, not overlap.
- Reviewer focus: the sync-axe exit-code matrix (postinstall vs manual), and
  that Step 1's reproduction was actually run, not assumed.
