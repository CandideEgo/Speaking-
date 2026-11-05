const task = await taskSpace(1);
const page = task.page("p1");
await page.cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await page.goto("http://localhost:3000/profile?tab=account", { timeout: 60000 });
await page.waitForSelector('text=已连接 AI · 私测', { state: "visible", timeout: 30000 });
await page.click('text=添加 AI 连接');
console.log(await page.snapshot({ scope: "full_page" }));
