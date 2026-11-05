const task = await taskSpace(1);
const page = task.page("p1");
await page.cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await page.goto("http://localhost:3000/profile?tab=account", { timeout: 60000 });
await page.waitForSelector('text=已连接 AI', { state: "visible", timeout: 30000 });
await page.waitForTimeout(1000);
const section = await page.evaluate(() => {
  const node = document.querySelector('[aria-label="已连接 AI"]');
  return {
    visible: Boolean(node),
    text: node?.innerText.slice(0, 1200),
    defaultPermissions: [...(node?.querySelectorAll('input[type="checkbox"]') || [])].map((e) => ({ checked: e.checked, disabled: e.disabled, label: e.closest("label")?.innerText })),
  };
});
console.log(JSON.stringify(section, null, 2));
