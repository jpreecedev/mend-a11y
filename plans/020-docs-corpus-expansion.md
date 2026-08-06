# Plan 020: Expand the hand-written docs corpus beyond the v1 twenty

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6b2f01f..HEAD -- src/docs/index.ts test/docs.test.ts CONTRIBUTING.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M–L (content-heavy; splittable — each batch of entries is
  independently shippable)
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction / docs
- **Planned at**: commit `6b2f01f`, 2026-08-06

## Why this matters

The docs corpus is the product's stated differentiator — README: "Plain-language
docs, written by hand… Rules we haven't written up yet fall back to the
scanner's own wording"; CONTRIBUTING: "The docs corpus is what makes Mend
Mend" and "Adding a docs entry for a fallback rule is the single
highest-value contribution." Today `src/docs/index.ts` documents **20 rules**
(the `V1_RULES` list in `test/docs.test.ts:5-26`) out of ~100 the engine can
flag. Every undocumented rule shows engine wording labelled as not-our-voice —
honest, but each one is the product not doing the thing it exists to do. This
plan adds the next 15 highest-frequency rules, chosen by real-world impact
data rather than guesswork.

## Current state

- `src/docs/index.ts` — `export const DOCS: Record<string, DocsEntry>`;
  20 keys at `6b2f01f`: image-alt, label, nested-interactive, color-contrast,
  region, heading-order, empty-heading, link-name, button-name,
  landmark-one-main, aria-required-attr, aria-valid-attr-value, duplicate-id,
  html-has-lang, document-title, meta-viewport, frame-title, list, listitem,
  tabindex.
- `DocsEntry` shape (`src/lib/types.ts:83-96`): `summary` (one/two sentence,
  fix-first), `explanation` (2–3 short paragraphs, joined with `\n\n`),
  `examples` (≥1 `{ label?, before, after }` with runnable code),
  `references` (`{ label, url }[]`). A `wcag(criterion, slug)` helper at the
  top of `index.ts` builds W3C Understanding links:

  ```ts
  const wcag = (criterion: string, slug: string): { label: string; url: string } => ({
    label: `WCAG ${criterion}`,
    url: `https://www.w3.org/WAI/WCAG21/Understanding/${slug}.html`,
  });
  ```

- The quality gate — `test/docs.test.ts` — asserts per rule: summary
  non-empty; explanation has ≥2 paragraphs (`\n\n`); ≥1 example with
  non-empty before AND after; ≥1 reference matching `^https://www.w3.org/`
  with a label. The `V1_RULES` array is the enforcement roster: **a rule not
  in that list is not guarded**, so every new entry must be appended there.
- The voice spec is `CONTRIBUTING.md` ("Writing docs entries", lines 1–60):
  lead with the fix; plain English; runnable code; name the nuance briefly;
  no padding; ONE reference — the canonical WCAG criterion. The exemplar held
  up as "the bar" is the `image-alt` entry (`src/docs/index.ts:14-33`).
- Category mapping: `normalize.ts`'s `categorize()` assigns panel categories
  from rule id/tags — no per-entry wiring needed; adding a `DOCS` key is the
  entire integration (CONTRIBUTING: "there's no wiring to do").

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Typecheck | `npm run typecheck`  | exit 0              |
| Docs gate | `npx tsx test/docs.test.ts` | all checks pass (grows by ~4 per entry) |
| Unit tests| `npm run test:unit`  | all suites pass, exit 0 |

## Suggested executor toolkit

- Rule frequency grounding: Deque's axe-core rule descriptions
  (https://dequeuniversity.com/rules/axe/4.11) and the WebAIM Million report
  (https://webaim.org/projects/million/) — the latter's most-common-failures
  list is the ranking authority for Step 1. WebFetch/WebSearch these if
  available; otherwise use the ranking baked into Step 1, which was derived
  from the 2024/2025 Million reports.

## Scope

**In scope**:
- `src/docs/index.ts` (new entries only — do not edit existing entries)
- `test/docs.test.ts` (append new rule ids to `V1_RULES`; rename the constant
  to `DOCUMENTED_RULES` if you touch it anyway — cosmetic, optional)

**Out of scope**:
- `src/lib/normalize.ts`, `categorize()` — no category rewiring.
- Existing 20 entries — no voice-drift "improvements" while in there.
- `CONTRIBUTING.md`.

## Git workflow

- Commit straight to `main` (repo policy). Batch commits are fine (e.g. five
  entries per commit), each leaving `npm run test:unit` green; message style:
  `Document aria-hidden-focus, select-name, … (docs batch 1/3)`.

## Steps

### Step 1: Fix the rule list

The 15 rules, ranked by real-world failure frequency (WebAIM Million top
failure categories mapped to axe rule ids) crossed against what the current
20 miss. Verify each id exists in the vendored engine before writing
(`grep -c '"<rule-id>"' public/vendor/axe.min.js` → ≥1):

1. `aria-hidden-focus` — focusable content inside `aria-hidden`
2. `aria-allowed-attr` — ARIA attributes invalid for the role
3. `aria-required-children` / 4. `aria-required-parent` — role composition
5. `select-name` — `<select>` without an accessible name
6. `input-button-name` — `<input type="button/submit">` without a name
7. `role-img-alt` — `role="img"` without a name
8. `svg-img-alt` — SVG images without a name
9. `autocomplete-valid` — wrong/missing autocomplete on identity fields
10. `th-has-data-cells` / 11. `td-headers-attr` — table header association
12. `definition-list` — malformed `<dl>` structure
13. `dlitem` — `<dt>/<dd>` outside a `<dl>`
14. `scrollable-region-focusable` — keyboard-trapped scroll areas
15. `image-redundant-alt` — alt text duplicating adjacent text

If a grep in Step 1 shows an id absent from the engine, drop it and promote
the next candidate: `link-in-text-block`, `label-title-only`,
`aria-progressbar-name`, `frame-title-unique` (in that order). Record final
roster in the report.

### Step 2: Write entries in batches of five

For each rule: match the `image-alt` exemplar structurally — summary leads
with the change to make; explanation is 2–3 paragraphs of *why it breaks and
for whom*, concrete assistive-tech consequences, no spec citations in prose;
1–2 examples with real, runnable before/after HTML (the before must actually
trigger the rule; the after must actually pass it); ONE `wcag(...)`
reference with the correct criterion number and Understanding slug for THAT
rule (verify slugs resolve — a wrong slug 404s in the product UI).

Accuracy bar (this is the plan's hard requirement, matching the product's
no-fabrication stance): every claim about what a screen reader does must be
true of current NVDA/VoiceOver behavior; when unsure, describe the failure
neutrally ("the control has no name, so assistive tech announces only its
role") rather than inventing specifics.

After each batch: append the ids to `V1_RULES`; run the gate.

**Verify** (per batch): `npx tsx test/docs.test.ts` → all pass, check count
grew by ~4 per new rule; `npm run typecheck` → exit 0.

### Step 3: Full gate

**Verify**: `npm run test:unit` → all suites pass; `npm run build` → exit 0.

## Test plan

`test/docs.test.ts` is the enforcement mechanism and grows automatically with
`V1_RULES` (Step 2). No new test files. The corpus guard's four assertions
per rule are the machine-checkable floor; the voice bar is human-reviewed.

## Done criteria

- [ ] `src/docs/index.ts` has 35 entries (20 existing + 15 new; count via
      `npx tsx -e "import('./src/docs/index.ts').then(m => console.log(Object.keys(m.DOCS).length))"` → 35)
- [ ] Every new id is in `test/docs.test.ts`'s roster and the gate passes
- [ ] Every new id exists in the vendored engine (Step 1 greps recorded)
- [ ] Every reference URL is a w3.org Understanding page for the cited criterion
- [ ] `npm run test:unit` and `npm run build` exit 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated (note batch progress if landing
      incrementally)

## STOP conditions

- An id from Step 1 (including all four alternates) is missing from the
  vendored engine — the roster premise is off; report the diff.
- You cannot verify a rule's actual trigger/pass behavior for an example and
  the Deque rule page doesn't settle it — mark that entry incomplete in the
  report rather than shipping a speculative example (the corpus's credibility
  IS the product).
- `test/docs.test.ts` asserts something the existing 20 entries pass but your
  entry structurally can't (would indicate the entry shape drifted).

## Maintenance notes

- The roster ranking goes stale as the web changes; re-derive from the
  then-current WebAIM Million on the next expansion rather than reusing this
  list.
- When axe-core is bumped (`npm run sync-axe`), a documented rule id can be
  renamed/retired upstream — the docs gate won't catch that (it checks DOCS
  contains the roster, not that the engine still fires those ids). A
  follow-up idea, deliberately not in this plan: assert every `DOCS` key
  exists in the vendored engine file.
- Reviewer focus: voice consistency against `image-alt`; before-examples that
  genuinely trigger the rule; single-reference discipline.
