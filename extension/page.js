// Runs in the page's own JavaScript world so it can wrap window.open, which
// Teams and Outlook use for some links. The decision is taken by content.js:
// the event is dispatched synchronously and cancelled when the link is routed.
(function () {
  "use strict";

  const OPEN_EVENT = "pwa-link-router:open";
  const MARKER = "__pwaLinkRouter";
  // Already wrapped by a previous injection (extension reloaded): the
  // wrapper only forwards events, so it keeps working as is.
  if (window.open[MARKER]) return;
  const nativeOpen = window.open;

  window.open = function open(url) {
    if (url) {
      let absolute = null;
      try {
        absolute = new URL(String(url), location.href).href;
      } catch (e) {
        // Let the browser deal with invalid URLs.
      }
      if (absolute) {
        const event = new CustomEvent(OPEN_EVENT, { detail: absolute, cancelable: true });
        if (!document.dispatchEvent(event)) return null;
      }
    }
    return nativeOpen.apply(this, arguments);
  };
  window.open[MARKER] = true;
})();
