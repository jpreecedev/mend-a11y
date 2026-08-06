// Guards plan 011: CLEAR_HIGHLIGHT must clear the overlay on the tab that
// actually has it (the stored highlight-tab id), not on whatever tab the
// message happens to be sent from. Before this plan, CLEAR_HIGHLIGHT carried
// its own tabId (the panel's active tab) and the handler nulled the stored id
// unconditionally — so switching tabs before the "leaving detail" cleanup fired
// orphaned the overlay on the tab that was actually highlighted, with no way
// left to reach it. Same plain-tsx-under-Node harness as pending-save.test.ts:
// drive handleMessage directly with a stubbed chrome global.
// Run with: tsx test/highlight-clear.test.ts
import type { Settings } from '../src/lib/types';
import { DEFAULT_SETTINGS } from '../src/lib/storage';

const checks: [string, boolean][] = [];
const ok = (name: string, cond: boolean) => checks.push([name, cond]);

// In-memory chrome.storage.session stub, mirroring pending-save.test.ts.
let session: Record<string, unknown> = {};
const sessionArea = {
  get: async (key: string) => (key in session ? { [key]: session[key] } : {}),
  set: async (obj: Record<string, unknown>) => {
    Object.assign(session, obj);
  },
  remove: async (key: string) => {
    delete session[key];
  },
};

// Records executeScript calls instead of returning [] so tests can assert
// which tab (and which injected function) was targeted.
interface ScriptCall {
  tabId: number;
  func: (...args: unknown[]) => unknown;
}
let scriptCalls: ScriptCall[] = [];

const noopEvent = { addListener: () => {} };
(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} }, session: sessionArea },
  action: { onClicked: noopEvent },
  tabs: { onUpdated: noopEvent, onRemoved: noopEvent, get: async () => ({ title: 'Example' }) },
  runtime: { id: 'test-ext', onConnect: noopEvent, onMessage: noopEvent },
  sidePanel: undefined,
  scripting: {
    executeScript: async (opts: { target: { tabId: number }; func: (...args: unknown[]) => unknown }) => {
      scriptCalls.push({ tabId: opts.target.tabId, func: opts.func });
      return [];
    },
  },
};

async function main(): Promise<void> {
  const { handleMessage } = await import('../src/background/service-worker');
  const { clearHighlightInPage, highlightInPage } = await import('../src/lib/highlight');
  // Panel-shaped sender: the guard (plan 012) requires a chrome-extension://
  // sender.url and a matching sender.id for non-relay messages.
  const sender = {
    id: 'test-ext',
    tab: undefined,
    url: 'chrome-extension://test/src/sidepanel/index.html',
  } as unknown as chrome.runtime.MessageSender;
  void DEFAULT_SETTINGS satisfies Settings;

  // --- HIGHLIGHT on tab 7 stores the id and injects into tab 7 ---
  session = {};
  scriptCalls = [];
  const highlighted = (await handleMessage(
    { type: 'HIGHLIGHT', tabId: 7, selector: '#foo' },
    sender,
  )) as { ok: boolean };
  ok('HIGHLIGHT resolves ok', highlighted.ok === true);
  ok('HIGHLIGHT stores highlightTabId: 7', session.highlightTabId === 7);
  ok(
    'HIGHLIGHT injects highlightInPage into tab 7',
    scriptCalls.length === 1 && scriptCalls[0].tabId === 7 && scriptCalls[0].func === highlightInPage,
  );

  // --- CLEAR_HIGHLIGHT after highlighting tab 7 clears tab 7, not the sender's tab ---
  scriptCalls = [];
  const cleared = (await handleMessage({ type: 'CLEAR_HIGHLIGHT' }, sender)) as { ok: boolean };
  ok('CLEAR_HIGHLIGHT resolves ok', cleared.ok === true);
  ok(
    'CLEAR_HIGHLIGHT injects clearHighlightInPage into tab 7 (the stored tab)',
    scriptCalls.length === 1 && scriptCalls[0].tabId === 7 && scriptCalls[0].func === clearHighlightInPage,
  );
  ok('CLEAR_HIGHLIGHT removes the stored highlightTabId', !('highlightTabId' in session));

  // --- CLEAR_HIGHLIGHT with nothing stored injects nothing and still resolves ok ---
  session = {};
  scriptCalls = [];
  const clearedBare = (await handleMessage({ type: 'CLEAR_HIGHLIGHT' }, sender)) as { ok: boolean };
  ok('CLEAR_HIGHLIGHT with nothing stored resolves ok', clearedBare.ok === true);
  ok('CLEAR_HIGHLIGHT with nothing stored injects nothing', scriptCalls.length === 0);

  // --- two HIGHLIGHT calls on different tabs, then CLEAR_HIGHLIGHT clears the most recent ---
  session = {};
  scriptCalls = [];
  await handleMessage({ type: 'HIGHLIGHT', tabId: 3, selector: '#a' }, sender);
  await handleMessage({ type: 'HIGHLIGHT', tabId: 9, selector: '#b' }, sender);
  ok('the second HIGHLIGHT overwrites the stored id', session.highlightTabId === 9);
  scriptCalls = [];
  await handleMessage({ type: 'CLEAR_HIGHLIGHT' }, sender);
  ok(
    'CLEAR_HIGHLIGHT clears only the most recently highlighted tab (9), not the first (3)',
    scriptCalls.length === 1 && scriptCalls[0].tabId === 9,
  );

  let pass = 0;
  for (const [name, cond] of checks) {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
    if (cond) pass++;
  }
  console.log(`\n${pass}/${checks.length} checks passed`);
  process.exit(pass === checks.length ? 0 : 1);
}

void main();
