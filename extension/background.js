importScripts("rules.js");

const HOST_NAME = "com.pwa_link_router.host";
const MENU_ID = "open-elsewhere";
const { BROWSER_NAMES, routeTarget, withDefaults } = globalThis.PwaLinkRouterRules;

function getSettings() {
  return new Promise((resolve) => chrome.storage.sync.get(null, (stored) => resolve(withDefaults(stored))));
}

function sendToHost(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(HOST_NAME, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response || { ok: false, error: "Réponse vide de l'hôte natif" });
      }
    });
  });
}

async function openElsewhere(url) {
  const settings = await getSettings();
  const response = await sendToHost({ action: "open", url, browser: settings.browser, command: settings.command });
  if (!response.ok) {
    console.error("Impossible d'ouvrir le lien dans l'autre navigateur :", response.error);
  }
  return response;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return false;
  if (message.type === "open" && typeof message.url === "string") {
    openElsewhere(message.url).then((response) => {
      // Don't lose a clicked link: fall back to a regular Edge tab.
      if (!response.ok && !message.test) chrome.tabs.create({ url: message.url });
      sendResponse(response);
    });
    return true;
  }
  if (message.type === "list") {
    sendToHost({ action: "list" }).then(sendResponse);
    return true;
  }
  return false;
});

// Safety net: a window opened from a PWA that the content script did not
// catch (e.g. "Open link in new tab" from the context menu). It shows up
// briefly, its URL is sent to the other browser, then it is closed.

const PENDING_TTL_MS = 10000;
const pendingTabs = new Map();

async function isFromWatchedWindow(sourceTabId, settings) {
  try {
    const source = await chrome.tabs.get(sourceTabId);
    if (settings.onlyInPwa) {
      const win = await chrome.windows.get(source.windowId);
      if (win.type !== "app") return null;
    }
    return source;
  } catch (e) {
    return null;
  }
}

async function checkPendingTab(tabId, url) {
  const entry = pendingTabs.get(tabId);
  if (!entry) return;
  if (Date.now() > entry.expires) {
    pendingTabs.delete(tabId);
    return;
  }
  const settings = await getSettings();
  // about:blank and in-app URLs give null: wait for the next navigation.
  const target = routeTarget(url, entry.sourceUrl, settings);
  if (!target || !pendingTabs.has(tabId)) return;
  pendingTabs.delete(tabId);
  const response = await openElsewhere(target);
  if (response.ok) chrome.tabs.remove(tabId).catch(() => {});
}

chrome.webNavigation.onCreatedNavigationTarget.addListener(async (details) => {
  const settings = await getSettings();
  if (!settings.enabled || !settings.safetyNet) return;
  const source = await isFromWatchedWindow(details.sourceTabId, settings);
  if (!source) return;
  pendingTabs.set(details.tabId, { sourceUrl: source.url || "", expires: Date.now() + PENDING_TTL_MS });
  checkPendingTab(details.tabId, details.url);
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0) checkPendingTab(details.tabId, details.url);
});

chrome.tabs.onRemoved.addListener((tabId) => pendingTabs.delete(tabId));

// Pages already open when the extension is installed, updated or reloaded
// keep a copy of the content scripts that can no longer reach the
// extension. Inject fresh copies so links keep being intercepted without
// having to reopen the PWAs.
async function injectIntoOpenTabs() {
  for (const script of chrome.runtime.getManifest().content_scripts || []) {
    const tabs = await chrome.tabs.query({ url: script.matches });
    for (const tab of tabs) {
      chrome.scripting
        .executeScript({
          target: { tabId: tab.id, allFrames: Boolean(script.all_frames) },
          files: script.js,
          world: script.world || "ISOLATED",
        })
        .catch(() => {});
    }
  }
}

// Context menu entry on links, for the cases where the user wants to choose.

async function updateMenu() {
  const settings = await getSettings();
  const title = `Ouvrir le lien dans ${BROWSER_NAMES[settings.browser] || settings.browser}`;
  chrome.contextMenus.update(MENU_ID, { title }, () => void chrome.runtime.lastError);
}

chrome.runtime.onInstalled.addListener(async () => {
  injectIntoOpenTabs();
  chrome.contextMenus.create({ id: MENU_ID, title: "Ouvrir le lien ailleurs", contexts: ["link"] }, () => {
    void chrome.runtime.lastError;
    updateMenu();
  });

  // Sanity check: make sure the native host is installed and answering.
  const response = await sendToHost({ action: "list" });
  if (response.ok) {
    console.log("Hôte natif OK, navigateurs :", response.browsers);
  } else {
    console.error("Hôte natif injoignable :", response.error);
    chrome.runtime.openOptionsPage();
  }
});

chrome.storage.onChanged.addListener(updateMenu);

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === MENU_ID && info.linkUrl) openElsewhere(info.linkUrl);
});
