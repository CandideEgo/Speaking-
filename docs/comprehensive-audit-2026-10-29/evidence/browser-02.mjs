const task = await taskSpace(4);
const page = task.page("p1");
console.log(await page.snapshot());
console.log({ screenshot: await page.screenshot({ path: "C:/Users/Fuwei/speaking/docs/comprehensive-audit-2026-10-29/evidence/login-desktop.png" }) });
console.log(await page.evaluate(() => ({
  url: location.href,
  title: document.title,
  viewport: { width: innerWidth, height: innerHeight },
  overflow: document.documentElement.scrollWidth > innerWidth,
  images: [...document.images].map(i => ({ alt: i.alt, complete: i.complete, width: i.naturalWidth })),
  navigation: performance.getEntriesByType("navigation").map(n => ({ duration: n.duration, responseStart: n.responseStart, domContentLoadedEventEnd: n.domContentLoadedEventEnd }))
})));
