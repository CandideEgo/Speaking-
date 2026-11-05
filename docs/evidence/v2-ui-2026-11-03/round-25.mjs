const task = await taskSpace(1);
const page = task.page("p1");
const state = await page.evaluate(() => ({
  url: location.href,
  buttons: [...document.querySelectorAll("button")].map((b) => b.textContent?.trim()).filter(Boolean),
  bodyText: document.body.innerText.slice(0, 1200),
}));
console.log(JSON.stringify(state, null, 2));
