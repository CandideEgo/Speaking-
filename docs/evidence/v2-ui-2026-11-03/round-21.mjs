const task = await taskSpace(1);
const page = task.page("p1");
await page.click("@60");
await page.waitForSelector('loc=css:[aria-label="教学题目选项"]', { state: "visible", timeout: 30000 });
await page.waitForTimeout(1500);
console.log({ url: await page.url() });
console.log(await page.snapshot());
