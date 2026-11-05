const task = await taskSpace(1);
const page = task.page("p1");
await page.click('loc=role:button[name="撤销连接"]');
await page.waitForSelector('loc=role:dialog', { state: "visible", timeout: 15000 });
console.log(await page.snapshot());
