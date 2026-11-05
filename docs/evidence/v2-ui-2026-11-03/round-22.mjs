const task = await taskSpace(1);
const page = task.page("p1");
await page.goto("http://localhost:3000/practice/exams/ea7569b0-1582-4df3-894c-12a906b083f2?mode=teach&content_revision_id=c8ae700f-eac0-43dc-8c27-3416c9070b28", { timeout: 60000 });
await page.waitForSelector('loc=css:[aria-label="教学题目选项"]', { state: "visible", timeout: 30000 });
await page.waitForTimeout(1000);
const state = await page.evaluate(() => ({
  url: location.href,
  buttons: [...document.querySelectorAll("button")].map((b) => b.textContent?.trim()).filter(Boolean).slice(0, 40),
  overflow: document.documentElement.scrollWidth > innerWidth,
}));
console.log(state);
console.log(await page.snapshot());
