const task = await taskSpace(2);
const page = task.page("p1");
console.log({ spaceId: task.spaceId, url: await page.url() });
await page.waitForTimeout(3000);
console.log(await page.snapshot());
