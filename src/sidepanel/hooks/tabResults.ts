import type { AuditResult } from '../../lib/types';

/**
 * Value key that uniquely identifies one audit run — the same key the sync
 * layer already uses (`App.tsx`'s `auditKey`). Comparing by this instead of
 * object identity is what lets a freshly-cloned-but-unchanged audit (e.g. a
 * re-resolve that reaches the same cache entry) pass through as a no-op.
 */
function keyOf(result: AuditResult): string {
  return `${result.url}|${result.startedAt}`;
}

/**
 * Folds the active-tab hook's latest `(tabId, cached, loading)` snapshot into
 * the panel's per-tab result map, in both directions:
 *
 * - A fresh or changed audit for `tabId` is added/replaced.
 * - An empty cache for `tabId` (the worker cleared it, typically because that
 *   tab navigated) removes any entry the panel was still holding for it, so a
 *   navigated-away audit never lingers and gets shown as if it still
 *   described the current page.
 *
 * `loading` gates the removal: a resolve briefly reports no cached audit
 * while it's still fetching, and clearing on that transient would blank a
 * perfectly valid result during an ordinary tab switch. Only an authoritative
 * "no audit for this tab" (loading === false) triggers a delete.
 *
 * Always returns `prev` unchanged (same reference) when there is nothing to
 * do, so callers can use this directly as a `setState` updater without extra
 * identity checks.
 */
export function foldCachedAudit(
  prev: Record<number, AuditResult>,
  tabId: number | null,
  cached: AuditResult | null,
  loading: boolean,
): Record<number, AuditResult> {
  if (tabId == null) return prev;

  if (cached) {
    const existing = prev[tabId];
    if (existing && keyOf(existing) === keyOf(cached)) return prev;
    return { ...prev, [tabId]: cached };
  }

  if (loading) return prev;
  if (!(tabId in prev)) return prev;
  const next = { ...prev };
  delete next[tabId];
  return next;
}

/**
 * Decides whether a `chrome.tabs.onUpdated` event for `updatedTabId` should
 * trigger a re-resolve of the active tab. `onUpdated` fires for every tab in
 * every window, not just the one the panel is showing, so without this a
 * background tab finishing navigation would re-fetch (and, downstream,
 * re-render) the panel's own in-view audit for no reason.
 *
 * `activeTabId == null` (nothing resolved yet) always resolves, so the very
 * first navigation event isn't missed while the panel is still starting up.
 */
export function shouldResolveForUpdate(
  updatedTabId: number,
  activeTabId: number | null,
): boolean {
  return activeTabId == null || updatedTabId === activeTabId;
}

/**
 * Sequences overlapping async calls (e.g. `resolve()` triggered by tab
 * activation, window focus, and tab update in close succession) so that only
 * the most recently begun call is allowed to commit its result — an older
 * call that happens to finish last must not overwrite a newer one.
 */
export interface Sequencer {
  /** Call at the start of an async operation; returns a token for that call. */
  begin(): number;
  /** True if `token` belongs to the most recently begun call. */
  isCurrent(token: number): boolean;
}

export function createSequencer(): Sequencer {
  let latest = 0;
  return {
    begin(): number {
      latest += 1;
      return latest;
    },
    isCurrent(token: number): boolean {
      return token === latest;
    },
  };
}
