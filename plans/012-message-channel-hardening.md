# Plan 012: Validate senders and constrain the dashboard-key relay

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6b2f01f..HEAD -- src/background/service-worker.ts src/lib/sync.ts test/dashboard-key-relay.test.ts test/pending-save.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches the account-connect funnel; behavior changes are
  deliberate and test-pinned)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `6b2f01f`, 2026-08-06

## Why this matters

Defensive hardening of the one channel that reads and writes the dashboard
API key. Two weaknesses, neither exploitable by an ordinary web page today,
both cheap to close before the surface grows:

1. **The relay adopts any origin and overwrites any key.** The
   `RELAY_DASHBOARD_KEY` handler accepts whatever origin the sender reports,
   rewrites `dashboardUrl` to it, replaces the stored key unconditionally, and
   immediately uploads the staged audit under the new credentials. The content
   script only runs on `https://mend-a11y.com/account*` and `/connect*`
   (manifest), so the practical trust boundary is "any script executing on
   those pages" — which includes any third-party tag the dashboard ever
   embeds. A hostile script there could swap in its own key, silently
   redirecting all future audit uploads (page URLs, titles, element HTML) to
   an account the user doesn't control.
2. **No `onMessage` branch validates its sender.** Every branch — including
   `GET_SETTINGS`, which returns the raw API key, and `SET_SETTINGS`, which
   writes arbitrary settings — trusts anything on the channel. Nothing
   external can reach it today (no `externally_connectable`, no
   `onMessageExternal`), but any future content script inherits full
   privilege silently. The extension's own relay content script *is already
   such a peer*: it lives on a web origin and currently has the implicit power
   to call every branch.

After this plan: privileged branches only answer the extension's own pages,
`RELAY_DASHBOARD_KEY` only accepts the dashboard origin it is configured for,
and the relay no longer rewrites the upload endpoint from sender-supplied
data.

## Current state

Files:

- `src/background/service-worker.ts` — `onMessage` listener (163–170) and
  `handleMessage` (172–362); the relay branch is 335–359.
- `src/lib/sync.ts` — `normalizeDashboardUrl` (66–70), `syncConfigured` (61–63).
- `test/dashboard-key-relay.test.ts` — pins current relay behavior, including
  the arbitrary-subdomain adoption this plan removes.
- `test/pending-save.test.ts` — drives `handleMessage` with
  `const sender = { origin: undefined } as chrome.runtime.MessageSender;`
  (line 74); its relay cases will need sender fixtures.
- `manifest.config.ts` — content script matches (lines 23–29); read-only
  context, do not modify.

`src/background/service-worker.ts:163-176` (current):

```ts
chrome.runtime.onMessage.addListener((message: PanelMessage, sender, sendResponse) => {
  void handleMessage(message, sender)
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
  return true; // keep the channel open for the async response
});

export async function handleMessage(
  message: PanelMessage,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  switch (message.type) {
```

`src/background/service-worker.ts:335-339` (current):

```ts
    case 'RELAY_DASHBOARD_KEY': {
      const settings = await getSettings();
      const origin = sender.origin ?? settings.dashboardUrl;
      const next = { ...settings, dashboardApiKey: message.apiKey, dashboardUrl: origin };
      await setSettings(next);
```

Chrome facts the implementation relies on (verify nothing contradicts them in
the installed `@types/chrome`):

- For messages from the extension's own pages (the side panel),
  `sender.id === chrome.runtime.id` and `sender.tab` is `undefined`, and
  `sender.url` starts with `chrome-extension://`.
- For messages from a content script, `sender.id === chrome.runtime.id`,
  `sender.tab` is set, and `sender.origin` is the page's origin.
- Messages from *other* extensions arrive with a different `sender.id` only if
  an `onMessageExternal` listener exists — this repo has none. The guard is
  belt-and-braces, not the only line.

Default dashboard origin: `https://mend-a11y.com` (`DEFAULT_SETTINGS` in
`src/lib/storage.ts:10`). Settings may hold a different URL (legacy installs,
local dev against `http://localhost:...`).

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Typecheck | `npm run typecheck`  | exit 0              |
| Unit tests| `npm run test:unit`  | all suites pass, exit 0 |
| Build+smoke | `npm run build && npm run test:smoke` | `3/3 checks passed` |

## Scope

**In scope**:
- `src/background/service-worker.ts` — sender guard + relay branch
- `test/dashboard-key-relay.test.ts` — update pinned expectations
- `test/pending-save.test.ts` — sender fixtures for relay cases
- `test/message-guard.test.ts` (create)
- `package.json` — append the new suite to `test:unit`

**Out of scope**:
- `src/content/dashboard-key-relay.ts` — its origin checks are correct; a
  nonce handshake (extension-initiated, page echoes it) is the stronger fix
  but requires a matching change in the mend-website repo. Deferred; record it
  in the maintenance notes, do not attempt it here.
- `manifest.config.ts` — match patterns stay as they are.
- Replacing the raw key in `GET_SETTINGS` with a `hasKey` boolean — the
  Settings screen renders the key in its (password-type) field
  (`SettingsScreen.tsx:85-92`), so that change forces a UI redesign. Deferred.
- `src/lib/messages.ts` — no message shape changes.

## Git workflow

- Commit straight to `main` (repo policy). One commit, e.g.
  `Guard worker messages by sender and pin the relay to the dashboard origin`.

## Steps

### Step 1: Add the sender guard

At the top of `handleMessage` in `src/background/service-worker.ts`, before
the switch:

```ts
  // Only two peers are ever legitimate on this channel: the extension's own
  // pages (the side panel), and the dashboard-key relay content script. Guard
  // by shape: panel senders have no tab; the relay is a content script whose
  // origin must match the configured dashboard. Everything else is refused
  // before any branch runs.
```

Implement:

- If `sender.id !== chrome.runtime.id` → return `{ ok: false, error: 'Unauthorized sender' }`.
- If `message.type === 'RELAY_DASHBOARD_KEY'`: require `sender.tab` to be set
  (content script) AND `sender.origin` to equal the *expected dashboard
  origin* (Step 2's helper). Otherwise refuse as above.
- For every other message type: require `sender.tab === undefined` and
  `sender.url?.startsWith('chrome-extension://')` — i.e. the panel. Otherwise
  refuse.

Keep the refusal shape `{ ok: false, error: string }` — it matches the
existing error convention (`service-worker.ts:167`, `:360-361`).

**Verify**: `npm run typecheck` → exit 0. `npm run test:unit` → expect
failures ONLY in `test/dashboard-key-relay.test.ts` and
`test/pending-save.test.ts` (they send `sender.origin: undefined`); any other
failing suite is a STOP.

### Step 2: Pin the relay to the expected origin and stop rewriting the URL

In the `RELAY_DASHBOARD_KEY` branch:

1. Compute the expected origin: `new URL(normalizeDashboardUrl(settings.dashboardUrl) ?? 'https://mend-a11y.com').origin`.
   (Import `normalizeDashboardUrl` from `../lib/sync` — the worker already
   imports `syncConfigured` and `uploadAudit` from there.)
2. The guard from Step 1 has already required `sender.origin` to equal that
   value, so **delete** the `const origin = sender.origin ?? settings.dashboardUrl;`
   line and keep `dashboardUrl` unchanged in the write:
   `const next = { ...settings, dashboardApiKey: message.apiKey };`.
3. Everything downstream (pending-save flush) stays as is.

Behavioral consequence to be explicit about: a relay from
`https://anything-else.example` (or a mend-a11y **subdomain**) is now refused.
`test/dashboard-key-relay.test.ts` currently pins subdomain adoption as
correct — that expectation inverts in Step 3.

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Update the two existing suites

- `test/pending-save.test.ts`: change the shared sender fixture so relay cases
  use a content-script-shaped sender
  (`{ origin: 'https://mend-a11y.com', tab: { id: 1 } }`), and
  `STAGE_PENDING_SAVE` cases use a panel-shaped sender
  (`{ tab: undefined, url: 'chrome-extension://test/src/sidepanel/index.html', id: ... }`).
  Note the stub `chrome` object must expose `runtime.id` (add e.g.
  `id: 'test-ext'` to the runtime stub) and senders must carry the same id.
- `test/dashboard-key-relay.test.ts`: rewrite the origin-adoption case — a
  relay from a non-matching origin (use a subdomain of the dashboard host) is
  now **refused** (`ok: false`) and writes nothing; a relay from the exact
  configured origin succeeds and leaves `dashboardUrl` untouched.

**Verify**: `npm run test:unit` → all suites pass.

### Step 4: New guard suite

Create `test/message-guard.test.ts` (harness modeled on
`test/pending-save.test.ts`) covering the guard matrix in the Test plan;
append `tsx test/message-guard.test.ts` to `test:unit`.

**Verify**: `npm run test:unit` → all pass. `npm run build && npm run test:smoke`
→ `3/3 checks passed`.

## Test plan

`test/message-guard.test.ts` — drive `handleMessage` directly:

1. `GET_SETTINGS` from a panel-shaped sender → settings returned.
2. `GET_SETTINGS` from a content-script-shaped sender (tab set, dashboard
   origin) → refused, and the response contains **no `settings` object**.
3. `SET_SETTINGS` from a tab-bearing sender → refused; storage unchanged.
4. `RELAY_DASHBOARD_KEY` from a panel-shaped sender (no tab) → refused.
5. `RELAY_DASHBOARD_KEY` from origin `https://evil.example` with a tab →
   refused; key unchanged; no fetch performed.
6. `RELAY_DASHBOARD_KEY` from the configured origin with a tab → accepted;
   key stored; `dashboardUrl` unchanged from its prior value.
7. With settings pointing at `http://localhost:3000` (dev), a relay from
   `http://localhost:3000` → accepted (the expected-origin rule follows the
   configured URL, not a hardcoded host).
8. A sender with a mismatched `sender.id` → refused for every message type
   tried (sample two).

**Verification**: `npm run test:unit` → all pass, including the new suite.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm run test:unit` exits 0; `test/message-guard.test.ts` in the chain
      covering the 8 cases
- [ ] `grep -n "sender.origin ?? settings.dashboardUrl" src/background/service-worker.ts`
      returns no matches
- [ ] `npm run build && npm run test:smoke` → `3/3 checks passed`
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts don't match the live code (drift since `6b2f01f`).
- The panel in a real browser fails the sender guard (i.e. `sender.tab` turns
  out to be set for side-panel messages in the installed Chrome) — the guard's
  platform assumption is wrong; report, don't loosen the guard blindly.
- Making the relay origin-strict breaks a documented funnel flow you find
  described in `plans/README.md` ("Dashboard funnel" section) beyond the
  subdomain case this plan deliberately removes.
- You find yourself editing `src/content/dashboard-key-relay.ts` or
  `manifest.config.ts`.

## Maintenance notes

- **Deferred, cross-repo**: an extension-initiated nonce handshake (worker
  generates a nonce, content script hands it to the page, page echoes it with
  the key) would close the remaining gap — a hostile script running on the
  *genuine* dashboard origin. Needs a mend-website change
  (`contract/README.md` → "The browser handoff" describes the current message
  shapes); plan it as a pair when picked up. Also deferred: confirm-in-panel
  before *replacing* a non-empty key, and returning `hasKey` instead of the
  raw key from `GET_SETTINGS` (needs a Settings-screen redesign).
- Any future content script must be added to the guard's allowlist explicitly
  — that is now a conscious decision instead of an inherited privilege.
- Reviewer focus: the guard must run before *every* branch (no early switch
  cases above it), and the dev-origin case (test 7) must keep working —
  local-portal development relies on it.
