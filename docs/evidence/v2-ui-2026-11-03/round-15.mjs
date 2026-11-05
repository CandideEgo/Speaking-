const task = await taskSpace("seeword v2 ui acceptance 2026-11-03");
const page = task.page("p1");
await page.cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await page.goto("http://localhost:3000/", { timeout: 60000 });
await page.waitForLoadState("networkidle");
console.log({ spaceId: task.spaceId, url: await page.url() });
console.log(await page.snapshot());
