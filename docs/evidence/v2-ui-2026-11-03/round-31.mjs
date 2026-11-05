const task = await taskSpace(1);
const page = task.page("p1");
await page.click("@120");
await page.waitForSelector('loc=role:dialog[name="撤销 Codex 连接？"]', { state: "hidden", timeout: 20000 });
await page.waitForSelector("text=已撤销", { state: "visible", timeout: 20000 });
await page.cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await page.evaluate(() => document.querySelector('[aria-label="已连接 AI"]')?.scrollIntoView({ block: "start" }));
await page.waitForTimeout(500);
const state = await page.evaluate(() => ({
  connectionRevoked: !document.querySelector('[aria-label="已连接 AI"]')?.innerText.includes("Codex"),
  tokenAbsent: !document.querySelector("#external-token"),
  overflow: document.documentElement.scrollWidth > innerWidth || (document.querySelector("main")?.scrollWidth || 0) > (document.querySelector("main")?.clientWidth || 0),
}));
console.log(state);
console.log({ screenshot: await page.screenshot({ path: "C:/Users/Fuwei/speaking/docs/evidence/v2-ui-2026-11-03/mobile-connections-390.png" }) });
