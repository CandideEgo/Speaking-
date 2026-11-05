const task = await taskSpace(1);
const page = task.page("p1");
await page.waitForSelector('loc=role:dialog[name="撤销 Codex 连接？"]', { state: "visible", timeout: 15000 });
console.log(await page.snapshot());
