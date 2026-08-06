// Runs only on the dashboard's own key-issuing pages — /account and /connect
// (see manifest.config.ts's content_scripts match). Listens for the API key
// the page broadcasts right after generating one, and relays it into extension
// storage so the user doesn't have to copy/paste it into Settings.
window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const data = event.data as unknown;
  if (
    typeof data !== 'object' ||
    data === null ||
    (data as Record<string, unknown>).source !== 'mend-website' ||
    (data as Record<string, unknown>).type !== 'MEND_API_KEY'
  ) {
    return;
  }
  const apiKey = (data as Record<string, unknown>).apiKey;
  if (typeof apiKey !== 'string' || !apiKey) return;

  chrome.runtime
    .sendMessage({ type: 'RELAY_DASHBOARD_KEY', apiKey })
    .then((res: unknown) => {
      // Tell /connect the upload landed so it stops waiting. It re-reads the
      // audit from its own database regardless — this is a nudge, not data —
      // so there is nothing here worth forging. Same origin discipline as the
      // inbound check above: our own origin, never "*".
      if ((res as { uploaded?: boolean } | undefined)?.uploaded === true) {
        window.postMessage(
          { source: 'mend-extension', type: 'MEND_AUDIT_SAVED' },
          window.location.origin,
        );
      }
    })
    .catch((e: unknown) => {
      console.warn('[mend] key relay failed', e);
    });
});
