// Guards the local JSON export module: filename shape (host + local
// timestamp, filesystem-safe), and payload parity with buildIngestPayload --
// the export must never fork from the ingest contract silently.
// Run with: tsx test/export.test.ts
import { exportAudit, exportFileName } from '../src/sidepanel/export';
import { buildIngestPayload } from '../src/lib/sync';
import type { AuditResult, NormalizedIssue } from '../src/lib/types';

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
  url: 'https://app.example.com/x',
  startedAt: 1_752_000_000_000,
  durationMs: 812,
  issues: [issue(), issue({ id: 'def456', ruleId: 'label', selector: 'input#q', domOrder: 1 })],
  totalChecks: 950,
  partial: false,
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// Independently reproduces the expected local-time stamp for a timestamp,
// so this test doesn't just re-import the module's own pad2 helper.
function expectedStamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(
    d.getHours(),
  )}${pad2(d.getMinutes())}`;
}

function main(): void {
  // --- exportFileName ---
  const stamp = expectedStamp(result.startedAt);
  ok(
    'filename combines host and local timestamp',
    exportFileName(result.url, result.startedAt) === `mend-audit-app.example.com-${stamp}.json`,
  );
  ok(
    'unparseable url falls back to "page"',
    exportFileName('not a url', result.startedAt) === `mend-audit-page-${stamp}.json`,
  );
  ok(
    'host is lowercased and stripped to filesystem-safe chars',
    exportFileName('https://Weird_Host!!.example.com:8080/p', result.startedAt) ===
      `mend-audit-weirdhost.example.com-${stamp}.json`,
  );

  // --- exportAudit ---
  const { name, json } = exportAudit(result, 'My Page');
  ok('exportAudit returns the expected filename', name === exportFileName(result.url, result.startedAt));
  const parsed: unknown = JSON.parse(json);
  ok(
    'export payload deep-equals buildIngestPayload (parity pin)',
    JSON.stringify(parsed) === JSON.stringify(buildIngestPayload(result, 'My Page')),
  );
  ok('the JSON is pretty-printed', json.includes('\n  '));

  let pass = 0;
  for (const [name, cond] of checks) {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
    if (cond) pass++;
  }
  console.log(`\n${pass}/${checks.length} checks passed`);
  process.exit(pass === checks.length ? 0 : 1);
}

main();
