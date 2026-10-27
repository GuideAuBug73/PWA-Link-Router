// End-to-end test in Chromium: loads the extension, registers the native
// host in a temporary profile and checks which links reach the host.
// Requires Playwright: node tests/e2e.js
const { chromium } = require("playwright");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const EXTENSION = path.join(ROOT, "extension");
const EXTENSION_ID = "hncnnfdenhfdmlplbicaogigpjecklje";

const PAGE = `<!doctype html><html><body>
  <a id="external" href="https://example.com/mail-link" target="_blank">external</a>
  <a id="internal" href="/mail/sentitems">internal</a>
  <a id="teams" href="https://teams.microsoft.com/l/meetup-join/1" target="_blank">teams</a>
  <a id="mailto" href="mailto:someone@example.com">mailto</a>
  <span id="nested-wrap"><a href="https://example.com/nested" target="_blank"><b id="nested">nested</b></a></span>
  <iframe id="frame" srcdoc='<a id="in-frame" href="https://example.com/in-frame" target="_blank">frame</a>'></iframe>
</body></html>`;

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plr-e2e-"));
  const opened = path.join(tmp, "opened.txt");
  const profile = path.join(tmp, "profile");
  fs.mkdirSync(path.join(profile, "NativeMessagingHosts"), { recursive: true });
  const template = fs.readFileSync(path.join(ROOT, "host", "com.pwa_link_router.host.json.in"), "utf8");
  fs.writeFileSync(
    path.join(profile, "NativeMessagingHosts", "com.pwa_link_router.host.json"),
    template
      .replace("@HOST_PATH@", path.join(ROOT, "host", "pwa_link_router_host.py"))
      .replace("@EXTENSION_ID@", EXTENSION_ID)
  );

  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  });
  try {
    await context.route(/^https:\/\/(outlook\.office\.com|login\.microsoftonline\.com|teams\.microsoft\.com|example\.com)\//, (route) =>
      route.fulfill({ contentType: "text/html", body: route.request().url().includes("/mail/") ? PAGE : "<p>other</p>" })
    );

    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent("serviceworker");
    assert.strictEqual(new URL(worker.url()).host, EXTENSION_ID);
    const command = `sh -c 'echo "$1" >> ${opened}' sh {url}`;
    // Headless Chromium is not a PWA window, so lift that restriction.
    await worker.evaluate((command) => chrome.storage.sync.set({ browser: "custom", command, onlyInPwa: false }), command);

    const page = await context.newPage();
    await page.goto("https://outlook.office.com/mail/inbox");
    await page.waitForTimeout(300);

    const pagesBefore = context.pages().length;
    await page.click("#external");
    await page.click("#nested");
    await page.click("#external", { button: "middle" });
    await page.frameLocator("#frame").locator("#in-frame").click();
    const openResult = await page.evaluate(() => window.open("https://example.com/window-open") === null);
    await page.waitForTimeout(1000);

    assert.ok(openResult, "window.open should return null for routed links");
    assert.strictEqual(context.pages().length, pagesBefore, "no Edge window should open for routed links");
    const routed = fs.readFileSync(opened, "utf8").trim().split("\n");
    assert.deepStrictEqual(routed.sort(), [
      "https://example.com/in-frame",
      "https://example.com/mail-link",
      "https://example.com/mail-link",
      "https://example.com/nested",
      "https://example.com/window-open",
    ]);

    // Sign-in popups and links to the other app must still open in Edge.
    const popup = context.waitForEvent("page");
    await page.evaluate(() => window.open("https://login.microsoftonline.com/common/oauth2"));
    await (await popup).close();
    const teams = context.waitForEvent("page");
    await page.click("#teams");
    await (await teams).close();
    assert.strictEqual(fs.readFileSync(opened, "utf8").trim().split("\n").length, 5);

    // With the PWA restriction on, a regular tab is left alone.
    await worker.evaluate(() => chrome.storage.sync.set({ onlyInPwa: true }));
    await page.waitForTimeout(300);
    const tab = context.waitForEvent("page");
    await page.click("#external");
    await (await tab).close();
    assert.strictEqual(fs.readFileSync(opened, "utf8").trim().split("\n").length, 5);

    console.log("e2e OK");
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
