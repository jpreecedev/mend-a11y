import type { AuditResult, NormalizedIssue, Settings } from './types';

// Client for the optional Mend dashboard (the mend-website portal). Nothing is
// ever sent unless the user has connected an account (portal URL + API key in
// settings); with a key present, audits upload automatically after each run
// unless the auto-save setting is off, in which case the Save button sends
// them. The payload shape here is the contract the portal's /api/ingest
// endpoint validates.

/** One flat issue as /api/ingest expects it (one entry per affected element). */
export interface IngestIssue {
  ruleId: string;
  impact: string;
  category: string;
  wcag: string[];
  title: string;
  description: string;
  helpUrl?: string;
  selector: string;
  html: string;
  failureSummary?: string;
  domOrder: number;
}

export interface IngestPayload {
  url: string;
  pageTitle: string;
  startedAt: number;
  durationMs: number;
  totalChecks: number;
  partial: boolean;
  issues: IngestIssue[];
}

export interface SyncOutcome {
  /** True when the portal had already stored this exact audit. */
  duplicate: boolean;
}

/**
 * Upload failure with the portal's own words plus enough structure for the UI
 * to decide whether a retry can help. `AUDIT_CAP` (the plan's saved-audit
 * limit) is the one refusal that retrying can never fix — the run stays
 * well-formed and keeps being refused until the user frees space or upgrades.
 */
export class SyncError extends Error {
  /** Machine code from the portal, e.g. 'AUDIT_CAP'; undefined when it sent none. */
  readonly code?: string;
  /** True when sending the same audit again could succeed (network, 429, 500). */
  readonly retryable: boolean;

  constructor(message: string, opts: { code?: string; retryable: boolean }) {
    super(message);
    this.name = 'SyncError';
    this.code = opts.code;
    this.retryable = opts.retryable;
  }
}

/** Sync is on only when the user has provided both a portal URL and a key. */
export function syncConfigured(settings: Settings): boolean {
  return settings.dashboardUrl.trim() !== '' && settings.dashboardApiKey.trim() !== '';
}

/** Portal origin with any trailing slashes dropped, or null if not http(s). */
export function normalizeDashboardUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/\S+$/i.test(trimmed)) return null;
  return trimmed;
}

export function buildIngestPayload(result: AuditResult, pageTitle: string): IngestPayload {
  return {
    url: result.url,
    pageTitle,
    startedAt: result.startedAt,
    durationMs: result.durationMs,
    totalChecks: result.totalChecks,
    partial: result.partial,
    issues: result.issues.map(toIngestIssue),
  };
}

function toIngestIssue(issue: NormalizedIssue): IngestIssue {
  return {
    ruleId: issue.ruleId,
    impact: issue.impact,
    category: issue.category,
    wcag: issue.wcag,
    title: issue.title,
    description: issue.description,
    helpUrl: issue.helpUrl,
    selector: issue.selector,
    html: issue.html,
    failureSummary: issue.failureSummary,
    domOrder: issue.domOrder,
  };
}

/**
 * POST the audit to the portal. Resolves with the outcome, or throws a
 * SyncError whose message is safe to show in the panel as-is.
 */
export async function uploadAudit(
  settings: Settings,
  result: AuditResult,
  pageTitle: string,
): Promise<SyncOutcome> {
  const base = normalizeDashboardUrl(settings.dashboardUrl);
  if (!base) {
    throw new SyncError(
      'The dashboard URL in settings must start with https:// (or http:// for local testing).',
      { retryable: false },
    );
  }
  const key = settings.dashboardApiKey.trim();

  let response: Response;
  try {
    response = await fetch(`${base}/api/ingest`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(buildIngestPayload(result, pageTitle)),
    });
  } catch {
    throw new SyncError(
      "Couldn't reach the dashboard. Check the URL in settings and your connection.",
      { retryable: true },
    );
  }

  if (response.status === 401) {
    throw new SyncError(
      'The dashboard rejected the API key. Generate a fresh one on your account page.',
      { retryable: false },
    );
  }
  if (!response.ok) {
    let detail = '';
    let code: string | undefined;
    try {
      const body = (await response.json()) as { error?: string; code?: string };
      detail = body.error ?? '';
      code = body.code;
    } catch {
      /* non-JSON error body; fall through to the generic message */
    }
    // Retryable: 429 after Retry-After, and 5xx (a stored earlier attempt makes
    // the retry a 200 duplicate). Not retryable: the plan cap (403 AUDIT_CAP)
    // and client-fix statuses (400/413) — resending the same audit cannot help.
    const retryable = response.status === 429 || response.status >= 500;
    throw new SyncError(detail || `The dashboard returned an error (HTTP ${response.status}).`, {
      code,
      retryable,
    });
  }

  const body = (await response.json()) as { duplicate?: boolean };
  return { duplicate: body.duplicate === true };
}
