// Shared between the content script, the service worker and the tests.
(function (root) {
  "use strict";

  const DEFAULT_SETTINGS = {
    enabled: true,
    // "default", "brave", "chrome", "chromium", "firefox", "vivaldi" or "custom".
    browser: "brave",
    // Used when browser is "custom"; {url} is replaced by the link.
    command: "",
    // Only act inside installed PWA windows, not in regular Edge tabs.
    onlyInPwa: true,
    // Catch the windows that slip through the click interception, at the
    // cost of a short flash.
    safetyNet: true,
    // Hosts that must keep opening in Edge: the apps themselves (pop-out
    // windows, meeting links) and the Microsoft sign-in pages.
    keepInEdge: [
      "outlook.office.com",
      "outlook.office365.com",
      "outlook.live.com",
      "outlook.cloud.microsoft",
      "teams.microsoft.com",
      "teams.live.com",
      "teams.cloud.microsoft",
      "login.microsoftonline.com",
      "login.microsoft.com",
      "login.live.com",
      "login.windows.net",
    ],
  };

  const BROWSER_NAMES = {
    default: "le navigateur par défaut",
    brave: "Brave",
    chrome: "Google Chrome",
    chromium: "Chromium",
    firefox: "Firefox",
    vivaldi: "Vivaldi",
    custom: "le navigateur personnalisé",
  };

  function parseUrl(url, base) {
    try {
      // An empty or invalid base makes the URL constructor throw, even for
      // absolute URLs.
      return base ? new URL(url, base) : new URL(url);
    } catch (e) {
      return null;
    }
  }

  // "example.com" matches only that host, "*.example.com" matches the host
  // and all its subdomains.
  function hostMatches(host, pattern) {
    host = host.toLowerCase();
    pattern = pattern.trim().toLowerCase();
    if (!pattern) return false;
    if (pattern.startsWith("*.")) {
      const domain = pattern.slice(2);
      return host === domain || host.endsWith("." + domain);
    }
    return host === pattern;
  }

  // Returns the absolute URL to hand to the other browser, or null when the
  // link should be left to Edge.
  function routeTarget(url, pageUrl, settings) {
    if (!settings.enabled) return null;
    const target = parseUrl(url, pageUrl);
    if (!target || (target.protocol !== "http:" && target.protocol !== "https:")) return null;
    const page = parseUrl(pageUrl);
    // Links inside the app itself (another mail, a pop-out window...).
    if (page && target.host === page.host) return null;
    if (settings.keepInEdge.some((pattern) => hostMatches(target.hostname, pattern))) return null;
    return target.href;
  }

  function withDefaults(stored) {
    return Object.assign({}, DEFAULT_SETTINGS, stored || {});
  }

  const api = { BROWSER_NAMES, DEFAULT_SETTINGS, hostMatches, routeTarget, withDefaults };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.PwaLinkRouterRules = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
