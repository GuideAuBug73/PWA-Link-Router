const HOST_NAME = "com.pwa_link_router.host";

// Sanity check: make sure the native host is installed and answering.
chrome.runtime.onInstalled.addListener(() => {
  chrome.runtime.sendNativeMessage(HOST_NAME, { action: "list" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Hôte natif injoignable :", chrome.runtime.lastError.message);
      return;
    }
    console.log("Hôte natif OK, navigateurs :", response.browsers);
  });
});
