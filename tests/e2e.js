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

// A page the content script does not run on, to exercise the safety net.
const UNCOVERED_PAGE = `<!doctype html><a id="escaped" href="https://example.com/escaped" target="_blank">escaped</a>`;

function pageFor(url) {
  if (url.includes("/mail/")) return PAGE;
  if (url.startsWith("https://example.org/")) return UNCOVERED_PAGE;
  return "<p>other</p>";
}

function readOpened(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n") : [];
}

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
    await context.route(/^https:\/\/(example\.org|outlook\.office\.com|login\.microsoftonline\.com|teams\.microsoft\.com|example\.com)\//, (route) =>
      route.fulfill({ contentType: "text/html", body: pageFor(route.request().url()) })
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

    // Safety net: a window the content script missed is closed and routed.
    const uncovered = await context.newPage();
    await uncovered.goto("https://example.org/app");
    const escaped = context.waitForEvent("page");
    await uncovered.click("#escaped");
    const escapedPage = await escaped;
    await escapedPage.waitForEvent("close", { timeout: 5000 });
    await page.waitForTimeout(300);
    assert.strictEqual(readOpened(opened).at(-1), "https://example.com/escaped");
    await uncovered.close();

    // Options page: host detected, settings saved.
    const options = await context.newPage();
    await options.goto(`chrome-extension://${EXTENSION_ID}/options.html`);
    await options.waitForSelector("#host-status.ok");
    assert.ok(await options.$('#browser option[value="brave"]'));
    assert.strictEqual(await options.inputValue("#browser"), "custom");
    assert.ok(await options.isVisible("#command"));
    await options.click("#test");
    await options.waitForSelector("#test-status.ok");
    assert.strictEqual(readOpened(opened).at(-1), "https://example.com/");
    await options.selectOption("#browser", "firefox");
    await options.waitForSelector("#save-status.ok");
    assert.ok(!(await options.isVisible("#command")));
    assert.strictEqual(await worker.evaluate(() => chrome.storage.sync.get("browser").then((s) => s.browser)), "firefox");
    await options.selectOption("#browser", "custom");
    await options.close();
    const routedCount = readOpened(opened).length;

    // With the PWA restriction on, a regular tab is left alone.
    await worker.evaluate(() => chrome.storage.sync.set({ onlyInPwa: true }));
    await page.waitForTimeout(300);
    const tab = context.waitForEvent("page");
    await page.click("#external");
    await (await tab).close();
    await page.waitForTimeout(500);
    assert.strictEqual(readOpened(opened).length, routedCount);

    console.log("e2e OK");
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
