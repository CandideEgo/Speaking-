const task = await taskSpace(4);
await task.page("p1").close();
const page = await task.newPage();
console.log({spaceId: task.spaceId, page: page.label});
try { await page.goto("http://localhost:3000/login"); } catch (e) { console.log({navigation: String(e)}); }
console.log(await page.snapshot());
