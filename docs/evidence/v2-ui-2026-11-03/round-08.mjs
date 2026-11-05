const task = await taskSpace(1);
const page = task.page("p1");
console.log({ viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, main: document.querySelector("main")?.getBoundingClientRect().toJSON(), scroll: [...document.querySelectorAll("main, [id*='scroll']")].map((e) => ({ tag: e.tagName, id: e.id, height: e.clientHeight, content: e.scrollHeight, top: e.scrollTop })) })) });
console.log({ screenshot: await page.screenshot({ path: "C:/Users/Fuwei/speaking/docs/evidence/v2-ui-2026-11-03/desktop-before.png" }) });
console.log(await page.snapshot({ scope: "full_page" }));
