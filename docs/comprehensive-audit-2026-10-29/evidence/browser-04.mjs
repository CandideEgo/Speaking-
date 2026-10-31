const task = await taskSpace(4);
const page = task.page("p1");
try { await page.goto("http://127.0.0.1:3000/privacy"); } catch (e) { console.log({navigation: String(e)}); }
console.log(await page.evaluate(() => ({ url: location.href, readyState: document.readyState, text: document.body?.innerText.slice(0, 5000) })));
console.log(await page.snapshot());
