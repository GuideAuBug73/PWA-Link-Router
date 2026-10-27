// Runs in the Outlook and Teams pages: catches links before Edge opens a
// window for them and hands them to the service worker instead.
(function () {
  "use strict";

  const { routeTarget, withDefaults } = globalThis.PwaLinkRouterRules;
  const OPEN_EVENT = "pwa-link-router:open";

  // Decisions have to be synchronous (preventDefault), so keep a cached copy
  // of the settings, starting from the defaults until storage answers.
  let settings = withDefaults();
  chrome.storage.sync.get(null, (stored) => {
    settings = withDefaults(stored);
  });
  chrome.storage.onChanged.addListener(() => {
    chrome.storage.sync.get(null, (stored) => {
      settings = withDefaults(stored);
    });
  });

  const pwaQuery = window.matchMedia(
    "(display-mode: standalone), (display-mode: window-controls-overlay), (display-mode: minimal-ui)"
  );

  function route(url) {
    if (settings.onlyInPwa && !pwaQuery.matches) return false;
    const target = routeTarget(url, location.href, settings);
    if (!target) return false;
    chrome.runtime.sendMessage({ type: "open", url: target });
    return true;
  }

  function findLink(event) {
    for (const node of event.composedPath()) {
      if (node instanceof HTMLAnchorElement || node instanceof HTMLAreaElement) {
        return node.href ? node : null;
      }
    }
    return null;
  }

  function onClick(event) {
    // Left click or middle click only; right click opens the context menu.
    if (event.button !== 0 && event.button !== 1) return;
    if (event.defaultPrevented) return;
    const link = findLink(event);
    if (!link || link.hasAttribute("download")) return;
    if (route(link.href)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  // Capture phase on window: we run before the page's own handlers.
  window.addEventListener("click", onClick, true);
  window.addEventListener("auxclick", onClick, true);

  // window.open calls, forwarded synchronously by page.js. Cancelling the
  // event tells page.js not to open the window.
  document.addEventListener(OPEN_EVENT, (event) => {
    if (typeof event.detail === "string" && route(event.detail)) {
      event.preventDefault();
    }
  });
})();
