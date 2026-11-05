const task = await taskSpace(1);
const page = task.page("p1");
console.log({ url: await page.url() });
await page.waitForTimeout(1500);
console.log(await page.snapshot());
