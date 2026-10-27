importScripts("rules.js");

const HOST_NAME = "com.pwa_link_router.host";
const { withDefaults } = globalThis.PwaLinkRouterRules;

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
    // Don't lose the link: fall back to a regular Edge tab.
    console.error("Impossible d'ouvrir le lien dans l'autre navigateur :", response.error);
    chrome.tabs.create({ url });
  }
  return response;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "open" && typeof message.url === "string") {
    openElsewhere(message.url).then(sendResponse);
    return true;
  }
  return false;
});

// Sanity check: make sure the native host is installed and answering.
chrome.runtime.onInstalled.addListener(async () => {
  const response = await sendToHost({ action: "list" });
  if (response.ok) {
    console.log("Hôte natif OK, navigateurs :", response.browsers);
  } else {
    console.error("Hôte natif injoignable :", response.error);
  }
});
