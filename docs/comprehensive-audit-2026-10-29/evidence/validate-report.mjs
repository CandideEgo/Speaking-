import fs from "node:fs";
import path from "node:path";
const base = "C:/Users/Fuwei/speaking/docs/comprehensive-audit-2026-10-29";
const docs = fs.readdirSync(base).filter(f => f.endsWith(".md"));
const missing = [];
let checked = 0;
for (const file of docs) {
  const content = fs.readFileSync(path.join(base, file), "utf8");
  for (const m of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = m[1].replace(/^<|>$/g, "").split("#")[0];
    if (!target || /^https?:\/\//.test(target)) continue;
    checked++;
    if (!fs.existsSync(path.resolve(base, target))) missing.push({ file, target });
  }
}
const result = {documents: docs.length, localLinksChecked: checked, missing};
fs.writeFileSync(path.join(base, "evidence/report-link-check.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (missing.length) process.exitCode = 1;
