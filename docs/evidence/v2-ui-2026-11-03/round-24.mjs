const task = await taskSpace(1);
const page = task.page("p1");
await page.click("loc=role:button[name=\"开始这道题的教学\"]");
await page.waitForSelector('loc=css:[aria-label="教学题目选项"]', { state: "visible", timeout: 30000 });
await page.waitForTimeout(800);
console.log({ url: await page.url() });
console.log(await page.snapshot());
