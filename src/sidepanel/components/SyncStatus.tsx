import { AlertIcon, CheckIcon, RefreshIcon } from './Icon';

export type SyncPhase = 'uploading' | 'synced' | 'error';

/** One audit's dashboard-upload state, as the panel tracks it per audit key. */
export interface SyncInfo {
  phase: SyncPhase;
  /** True when the portal already had this exact audit stored. */
  duplicate?: boolean;
  /** The portal's message, shown verbatim (the contract keeps it readable). */
  error?: string;
  /** True when sending again could succeed; the chip offers Retry only then. */
  retryable?: boolean;
}

/**
 * Live status chip for the automatic dashboard upload. Uploading and synced
 * are quiet statements; a retryable failure becomes a button, a permanent one
 * (rejected key, plan cap) stays a labelled notice whose full message the
 * toast has already shown.
 */
export function SyncStatus({ sync, onRetry }: { sync: SyncInfo; onRetry: () => void }) {
  if (sync.phase === 'uploading') {
    return (
      <span class="sync-chip uploading" role="status">
        <span class="sync-dot" aria-hidden="true" />
        Saving to dashboard…
      </span>
    );
  }
  if (sync.phase === 'synced') {
    return (
      <span class="sync-chip synced" role="status">
        <CheckIcon size={13} />
        {sync.duplicate ? 'Already on dashboard' : 'Saved to dashboard'}
      </span>
    );
  }
  if (sync.retryable) {
    return (
      <button class="sync-chip error" onClick={onRetry} title={sync.error}>
        <RefreshIcon size={13} />
        Not saved — retry
      </button>
    );
  }
  return (
    <span class="sync-chip error" role="status" title={sync.error}>
      <AlertIcon size={13} />
      Not saved
    </span>
  );
}
