const task = await taskSpace(1);
const page = task.page("p1");
await page.reload({ timeout: 30000 });
await page.waitForSelector('text=已连接 AI', { state: "visible", timeout: 30000 });
await page.cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await page.evaluate(() => {
  const nodes = [...document.querySelectorAll("button")].filter((b) => ["导出", "注销"].includes(b.textContent?.trim()));
  nodes[nodes.length - 1]?.scrollIntoView({ block: "center" });
});
await page.waitForTimeout(1000);
const state = await page.evaluate(() => {
  const info = [...document.querySelectorAll("button")]
    .filter((b) => ["导出", "注销"].includes(b.textContent?.trim()))
    .map((b) => ({ text: b.textContent?.trim(), width: Math.round(b.getBoundingClientRect().width), height: Math.round(b.getBoundingClientRect().height) }));
  return { info, overflow: document.documentElement.scrollWidth > innerWidth };
});
console.log(state);
console.log({ screenshot: await page.screenshot({ path: "C:/Users/Fuwei/speaking/docs/evidence/v2-ui-2026-11-03/mobile-account-buttons-390.png" }) });
