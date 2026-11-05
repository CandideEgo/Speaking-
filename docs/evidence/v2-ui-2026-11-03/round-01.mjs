const task = await taskSpace("seeword-v2-acceptance-20261103");
const page = task.page("p1");
await page.goto("http://localhost:3000/login?next=%2Fpractice", { timeout: 60000 });
console.log({ spaceId: task.spaceId, page: page.label });
console.log(await page.snapshot());
