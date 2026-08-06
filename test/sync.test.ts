// Guards the dashboard sync client: URL normalization, the payload mapping the
// portal's /api/ingest validates, and upload outcome handling (created,
// duplicate, rejected key, server error, unreachable host).
// Run with: tsx test/sync.test.ts
import {
  SyncError,
  buildIngestPayload,
  normalizeDashboardUrl,
  syncConfigured,
  uploadAudit,
} from '../src/lib/sync';
import { DEFAULT_SETTINGS } from '../src/lib/storage';
import type { AuditResult, NormalizedIssue, Settings } from '../src/lib/types';

const checks: [string, boolean][] = [];
const ok = (name: string, cond: boolean) => checks.push([name, cond]);

const issue = (over: Partial<NormalizedIssue> = {}): NormalizedIssue => ({
  id: 'abc123',
  ruleId: 'image-alt',
  impact: 'critical',
  category: 'images',
  wcag: ['1.1.1'],
  title: 'Images must have alternate text',
  description: 'Add an alt attribute.',
  documented: true,
  helpUrl: 'https://example.com/help',
  selector: 'img.hero',
  html: '<img class="hero">',
  failureSummary: 'Element has no alt',
  domOrder: 3,
  ...over,
});

const result: AuditResult = {
  url: 'https://site.test/page',
  startedAt: 1_752_000_000_000,
  durationMs: 812,
  issues: [issue(), issue({ id: 'def456', ruleId: 'label', selector: 'input#q', domOrder: 1 })],
  totalChecks: 950,
  partial: false,
};

const settings = (over: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  dashboardUrl: 'https://portal.test',
  dashboardApiKey: 'mend_key',
  ...over,
});

// Swap in a scripted fetch; each call shifts the next response (or throw).
type Scripted = { status: number; body?: unknown } | 'network-error';
let fetchCalls: { url: string; init: RequestInit }[] = [];
function scriptFetch(...responses: Scripted[]): void {
  fetchCalls = [];
  const queue = [...responses];
  (globalThis as { fetch: unknown }).fetch = async (url: string, init: RequestInit) => {
    fetchCalls.push({ url, init });
    const next = queue.shift();
    if (!next || next === 'network-error') throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status });
  };
}

async function rejects(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function rejectsWith(p: Promise<unknown>): Promise<SyncError | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof SyncError ? e : null;
  }
}

async function main(): Promise<void> {
  // --- configuration gate ---
  ok('defaults leave sync off', !syncConfigured(DEFAULT_SETTINGS));
  ok('url + key turn sync on', syncConfigured(settings()));
  ok('key alone is not enough', !syncConfigured(settings({ dashboardUrl: '  ' })));
  ok('auto-save defaults on', DEFAULT_SETTINGS.autoSync === true);
  ok('prompt dismissal does not affect the sync gate',
    syncConfigured(settings({ accountPromptDismissed: true })));

  // --- URL normalization ---
  ok('trailing slashes drop', normalizeDashboardUrl('https://a.test///') === 'https://a.test');
  ok('surrounding space drops', normalizeDashboardUrl('  http://localhost:3000 ') === 'http://localhost:3000');
  ok('non-http scheme rejected', normalizeDashboardUrl('ftp://a.test') === null);
  ok('bare host rejected', normalizeDashboardUrl('portal.test') === null);

  // --- payload mapping ---
  const payload = buildIngestPayload(result, 'My Page');
  ok('payload carries audit metadata',
    payload.url === result.url &&
      payload.startedAt === result.startedAt &&
      payload.durationMs === 812 &&
      payload.totalChecks === 950 &&
      payload.partial === false &&
      payload.pageTitle === 'My Page');
  ok('payload keeps one entry per element', payload.issues.length === 2);
  const first = payload.issues[0]!;
  ok('issue fields map through',
    first.ruleId === 'image-alt' &&
      first.impact === 'critical' &&
      first.category === 'images' &&
      first.wcag.join(',') === '1.1.1' &&
      first.selector === 'img.hero' &&
      first.failureSummary === 'Element has no alt' &&
      first.domOrder === 3);
  ok('panel-only fields are not sent',
    !('id' in first) && !('documented' in first) && !('frameUrl' in first));

  // --- upload outcomes ---
  scriptFetch({ status: 201, body: { auditId: 'x', violations: 2 } });
  const created = await uploadAudit(settings(), result, 'My Page');
  ok('201 resolves as not duplicate', created.duplicate === false);
  ok('posts to /api/ingest on the portal', fetchCalls[0]?.url === 'https://portal.test/api/ingest');
  const headers = fetchCalls[0]?.init.headers as Record<string, string>;
  ok('sends the bearer key', headers.authorization === 'Bearer mend_key');
  ok('body is the ingest payload',
    (JSON.parse(fetchCalls[0]?.init.body as string) as { url: string }).url === result.url);

  scriptFetch({ status: 200, body: { duplicate: true } });
  const dup = await uploadAudit(settings(), result, 'My Page');
  ok('200 duplicate resolves as duplicate', dup.duplicate === true);

  scriptFetch({ status: 401, body: { error: 'Unauthorized' } });
  const unauth = await rejectsWith(uploadAudit(settings(), result, 'My Page'));
  ok('401 explains the key was rejected', unauth != null && /API key/.test(unauth.message));
  ok('401 is not retryable', unauth != null && !unauth.retryable);

  scriptFetch({ status: 400, body: { error: 'url must be an http(s) URL' } });
  const badReq = await rejectsWith(uploadAudit(settings(), result, 'My Page'));
  ok('400 surfaces the server message', badReq?.message === 'url must be an http(s) URL');
  ok('400 is not retryable', badReq != null && !badReq.retryable);

  // The plan's saved-audit cap: message verbatim, code surfaced, never retried.
  scriptFetch({ status: 403, body: { error: 'Saved-audit limit reached. Free up space or upgrade.', code: 'AUDIT_CAP' } });
  const capped = await rejectsWith(uploadAudit(settings(), result, 'My Page'));
  ok('403 keeps the cap message verbatim',
    capped?.message === 'Saved-audit limit reached. Free up space or upgrade.');
  ok('403 carries the AUDIT_CAP code', capped?.code === 'AUDIT_CAP');
  ok('403 cap is not retryable', capped != null && !capped.retryable);

  scriptFetch({ status: 429, body: { error: 'Too many requests. Try again in a minute.' } });
  const limited = await rejectsWith(uploadAudit(settings(), result, 'My Page'));
  ok('429 surfaces the server message', limited?.message === 'Too many requests. Try again in a minute.');
  ok('429 is retryable', limited?.retryable === true);

  scriptFetch({ status: 500 });
  const server = await rejectsWith(uploadAudit(settings(), result, 'My Page'));
  ok('500 falls back to a generic message', server != null && /HTTP 500/.test(server.message));
  ok('500 is retryable', server?.retryable === true);

  scriptFetch('network-error');
  const offline = await rejectsWith(uploadAudit(settings(), result, 'My Page'));
  ok('network failure reads as unreachable', offline != null && /reach the dashboard/.test(offline.message));
  ok('network failure is retryable', offline?.retryable === true);

  const badUrl = await rejects(uploadAudit(settings({ dashboardUrl: 'portal.test' }), result, 'T'));
  ok('invalid URL fails before any request', badUrl != null && /https:\/\//.test(badUrl));

  let pass = 0;
  for (const [name, cond] of checks) {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
    if (cond) pass++;
  }
  console.log(`\n${pass}/${checks.length} checks passed`);
  process.exit(pass === checks.length ? 0 : 1);
}

void main();
