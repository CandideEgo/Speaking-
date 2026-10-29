const task = await taskSpace(4);
const page = task.page("p1");
console.log(await page.info());
console.log(await page.evaluate(() => ({
  url: location.href,
  readyState: document.readyState,
  text: document.body?.innerText.slice(0, 5000),
  resources: performance.getEntriesByType("resource").slice(-12).map(e => ({name: e.name, duration: e.duration})),
  viewport: { width: innerWidth, height: innerHeight },
  overflow: document.documentElement.scrollWidth > innerWidth,
})));
console.log(await page.snapshot());
