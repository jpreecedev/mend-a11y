import type { AuditResult } from '../lib/types';
import { buildIngestPayload } from '../lib/sync';

// Local JSON export for keyless users: the panel's only affordance for
// getting an audit out of the extension without a dashboard account. The
// export IS the ingest payload: one audit shape everywhere, pinned by
// test/contract. Provenance fields are deliberately omitted -- byte-parity
// with the contract is worth more than metadata today. See plan 019.

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * `mend-audit-<host>-<YYYYMMDD-HHmm>.json`, filesystem-safe: the host is
 * lowercased and stripped of anything outside `[a-z0-9.-]`; unparseable URLs
 * fall back to `page`. The timestamp is local time, zero-padded.
 */
export function exportFileName(url: string, startedAt: number): string {
  let host = 'page';
  try {
    host = new URL(url).hostname.toLowerCase().replace(/[^a-z0-9.-]/g, '') || 'page';
  } catch {
    host = 'page';
  }
  const d = new Date(startedAt);
  const stamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(
    d.getHours(),
  )}${pad2(d.getMinutes())}`;
  return `mend-audit-${host}-${stamp}.json`;
}

/** Wraps `buildIngestPayload` into the file the download button writes. */
export function exportAudit(result: AuditResult, pageTitle: string): { name: string; json: string } {
  const json = JSON.stringify(buildIngestPayload(result, pageTitle), null, 2);
  return { name: exportFileName(result.url, result.startedAt), json };
}
