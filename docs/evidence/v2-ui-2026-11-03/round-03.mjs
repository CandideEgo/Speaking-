const task = await taskSpace(1);
const page = task.page("p1");
await page.cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await page.goto("http://localhost:3000/practice", { timeout: 60000 });
await page.waitForSelector('loc=role:region[name="单题教学"]', { state: "visible", timeout: 30000 });
console.log(await page.snapshot());
