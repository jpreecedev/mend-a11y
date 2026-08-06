import type { AuditResult } from '../../lib/types';
import { AlertIcon } from './Icon';

/**
 * Tells the person looking at a result that the audit didn't cover the
 * whole page (e.g. a frame couldn't be scripted), so a clean-looking result
 * — including the full-screen "PASSED" stamp — isn't mistaken for complete
 * coverage. Shared between ResultsScreen and PassScreen.
 *
 * `role="status"` rather than `role="alert"`: this is standing context
 * about the result being shown, not an interruption announcing something
 * that just failed. Contrast with EmptyScreen's banner, which uses `alert`
 * because it reports a just-failed run action.
 */
export function PartialBanner({ result }: { result: AuditResult }) {
  if (!result.partial || !result.partialReason) return null;
  return (
    <div class="warning-banner" role="status">
      <AlertIcon />
      <span>{result.partialReason}</span>
    </div>
  );
}
