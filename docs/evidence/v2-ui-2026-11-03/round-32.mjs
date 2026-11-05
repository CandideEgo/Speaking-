const task = await taskSpace(1);
const page = task.page("p1");
await page.cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await page.evaluate(() => document.querySelector('[aria-label="已连接 AI"]')?.scrollIntoView({ block: "start" }));
await page.waitForTimeout(800);
const state = await page.evaluate(() => ({
  section: document.querySelector('[aria-label="已连接 AI"]')?.innerText.slice(0, 400),
  tokenAbsent: !document.querySelector("#external-token"),
  overflow: document.documentElement.scrollWidth > innerWidth || (document.querySelector("main")?.scrollWidth || 0) > (document.querySelector("main")?.clientWidth || 0),
}));
console.log(state);
console.log({ screenshot: await page.screenshot({ path: "C:/Users/Fuwei/speaking/docs/evidence/v2-ui-2026-11-03/mobile-connections-390.png" }) });
