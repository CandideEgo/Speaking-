const task = await taskSpace(1);
const page = task.page("p1");
await page.goto("http://localhost:3000/practice", { timeout: 60000 });
await page.waitForSelector('text=教学', { state: "visible", timeout: 20000 }).catch(() => {});
await page.waitForTimeout(2000);
console.log({ url: await page.url() });
console.log(await page.snapshot());
