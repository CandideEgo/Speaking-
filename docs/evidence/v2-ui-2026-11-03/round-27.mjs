const task = await taskSpace(1);
const page = task.page("p1");
const keys = await page.evaluate(() => Object.keys(localStorage).map((k) => ({ key: k, sample: String(localStorage.getItem(k)).slice(0, 120) })));
console.log(JSON.stringify(keys, null, 2));
