// Runs in the Outlook and Teams pages: catches links before Edge opens a
// window for them and hands them to the service worker instead.
(function () {
  "use strict";

  const { routeTarget, withDefaults } = globalThis.PwaLinkRouterRules;
  const OPEN_EVENT = "pwa-link-router:open";
  const TEARDOWN_EVENT = "pwa-link-router:teardown";

  // When the extension is reloaded or updated, the copy of this script
  // already running in open pages is cut off from the extension and a new
  // copy is injected next to it (see background.js). Tell older copies to
  // step aside.
  document.dispatchEvent(new CustomEvent(TEARDOWN_EVENT));

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

  function extensionAlive() {
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  function route(url) {
    if (!extensionAlive()) {
      teardown();
      return false;
    }
    if (settings.onlyInPwa && !pwaQuery.matches) return false;
    const target = routeTarget(url, location.href, settings);
    if (!target) return false;
    try {
      chrome.runtime.sendMessage({ type: "open", url: target });
    } catch (e) {
      // Cut off from the extension: let Edge handle the link.
      teardown();
      return false;
    }
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

  // window.open calls, forwarded synchronously by page.js. Cancelling the
  // event tells page.js not to open the window.
  function onOpen(event) {
    if (typeof event.detail === "string" && route(event.detail)) {
      event.preventDefault();
    }
  }

  function teardown() {
    window.removeEventListener("click", onClick, true);
    window.removeEventListener("auxclick", onClick, true);
    document.removeEventListener(OPEN_EVENT, onOpen);
    document.removeEventListener(TEARDOWN_EVENT, teardown);
  }

  // Capture phase on window: we run before the page's own handlers.
  window.addEventListener("click", onClick, true);
  window.addEventListener("auxclick", onClick, true);
  document.addEventListener(OPEN_EVENT, onOpen);
  document.addEventListener(TEARDOWN_EVENT, teardown);
})();
