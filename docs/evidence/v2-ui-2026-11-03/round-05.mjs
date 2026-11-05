const task = await taskSpace(1);
const page = task.page("p1");
console.log(await page.snapshot());
