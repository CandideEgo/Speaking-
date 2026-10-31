const task = await taskSpace("SeeWord comprehensive audit 2026-10-29");
const page = task.page("p1");
console.log({ spaceId: task.spaceId, page: page.label });
await page.goto("http://localhost:3000/");
console.log(await page.snapshot());
