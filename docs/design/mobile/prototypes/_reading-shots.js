/**
 * Render the "frame -> current sentence -> transcript" layout prototypes at 414x896 @2x.
 * Read-only on the prototype files; writes shots/*.png next to this script.
 */
const path = require("path");
const { chromium } = require("C:/Users/Administrator/Speaking/frontend/node_modules/playwright");

const DIR = path.resolve(__dirname);
const FILES = [
  ["R0-today.html", "R0.png"],
  ["R1-sheet-head.html", "R1.png"],
  ["R2-sheet-now.html", "R2.png"],
  ["R3-band.html", "R3.png"],
  ["R4-min.html", "R4.png"],
  ["R5-flush.html", "R5.png"],
  ["R6-band-meta.html", "R6.png"],
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 896 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  for (const [file, out] of FILES) {
    await page.goto("file:///" + path.join(DIR, file).replace(/\\/g, "/"));
    await page.waitForTimeout(250);
    const metrics = await page.evaluate(() => {
      const g = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
          radius: cs.borderTopLeftRadius, border: cs.borderTopWidth,
        };
      };
      return {
        frame: g(".frame"),
        sheet: g(".sheet"),
        now: g(".now, .band-flush"),
        head: g(".sheet-head, .tabs, .band-meta"),
        list: g(".list"),
        firstItem: g(".item"),
        bar: g(".bottombar"),
      };
    });
    console.log(file, JSON.stringify(metrics));
    await page.screenshot({ path: path.join(DIR, "shots", out) });
  }
  await browser.close();
})().catch((e) => {
  console.error("RENDER FAILED:", e.message);
  process.exit(1);
});
