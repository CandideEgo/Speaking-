const task = await taskSpace(1);
const page = task.page("p1");
await page.click('loc=role:button[name="开始这道题的教学"]');
await page.waitForURL(/teaching_session_id=/, { timeout: 30000 });
await page.waitForSelector('loc=role:group[name="教学题目选项"]', { state: "visible", timeout: 30000 });
console.log(await page.snapshot());
