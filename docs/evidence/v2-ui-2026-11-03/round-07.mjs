const task = await taskSpace(1);
const page = task.page("p1");
await page.click('loc=css:[aria-label="教学题目选项"] button >> nth=0');
await page.click('loc=role:button[name="提交答案"]');
await page.waitForSelector('text=还需再想想', { state: "visible", timeout: 20000 });
await page.click('loc=role:button[name="下一条提示"]');
await page.waitForSelector('text=Find the sentence comparing the two groups.', { state: "visible", timeout: 20000 });
console.log({ url: await page.url(), viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth, analysisVisible: document.body.innerText.includes("答案与解析 ·") })) });
console.log(await page.snapshot({ scope: "full_page" }));
