// Renders extension/icons/icon.svg to the PNG sizes used by the manifest.
// Requires Playwright: node tools/render_icons.js
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const ICONS = path.resolve(__dirname, "..", "extension", "icons");
const SIZES = [16, 32, 48, 128];

(async () => {
  const svg = fs.readFileSync(path.join(ICONS, "icon.svg"), "utf8");
  const browser = await chromium.launch();
  for (const size of SIZES) {
    // The title bar line turns into noise at 16px.
    const source = size <= 16 ? svg.replace(/<path d="M22 54H66"[^>]*\/>/, "") : svg;
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<body style="margin:0">${source.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`);
    await page.screenshot({ path: path.join(ICONS, `icon${size}.png`), omitBackground: true });
  }
  await browser.close();
})();
