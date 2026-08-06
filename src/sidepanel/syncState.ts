import type { SyncInfo } from './components/SyncStatus';

/**
 * A changed key invalidates previous refusals: a 401 recorded under the old
 * key must not block the new key from trying. Synced/uploading entries stay --
 * re-sending those would duplicate, and the portal's duplicate check is not
 * a license to spam it. Returns `prev` unchanged (same reference) when there
 * is nothing to drop, so it is safe as a setState updater.
 */
export function clearErrorEntries(prev: Record<string, SyncInfo>): Record<string, SyncInfo> {
  const entries = Object.entries(prev).filter(([, info]) => info.phase !== 'error');
  if (entries.length === Object.keys(prev).length) return prev;
  return Object.fromEntries(entries);
}
