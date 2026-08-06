import { CloseIcon, ExternalIcon } from './Icon';

/**
 * Post-audit callout for keyless users: the top of the dashboard-adoption
 * funnel. Signup opens `/signup?from=extension`; once the account page
 * generates a key, the content-script relay fills settings and the open panel
 * swaps this callout for live sync without a reopen. Dismissal is one-time and
 * global (Settings keeps the evergreen path).
 */
export function AccountPrompt({
  onSignup,
  onDismiss,
}: {
  onSignup: () => void;
  onDismiss: () => void;
}) {
  return (
    <div class="account-prompt" role="note">
      <div class="account-prompt-text">
        <strong>Keep this audit?</strong> Create a free account and every audit you run saves to
        your dashboard automatically — track fixes over time.
      </div>
      <div class="account-prompt-actions">
        <button class="btn small primary" onClick={onSignup}>
          Create free account
          <ExternalIcon />
        </button>
        <button class="icon-btn" aria-label="Dismiss" onClick={onDismiss}>
          <CloseIcon size={15} />
        </button>
      </div>
    </div>
  );
}
