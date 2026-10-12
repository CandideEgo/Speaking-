#!/usr/bin/env node
/**
 * check-design-system.mjs — DEC-075 前端设计系统门禁（4 条规则）
 *
 * 为什么需要它：P1–P5 把容器、页头、圆角、字号、卡片各自收敛成「唯一写法」，但那只是
 * 一次性整理。没有机器检查，下一个人照样可以在页面里写 `container-page`、在组件里写
 * `bg-blue-100`，收敛会在两次改动内回到起点。本脚本是那几条不变量的唯一执行点。
 *
 * 四条规则（DEC-075 ⑤ 末条）：
 *   1) src/app 下所有文件        不得出现 `container-page` / `container-wide`
 *                                破坏示例：页面自己选容器（P1 已把这活收进壳层）
 *   2) src 下所有 .ts / .tsx     不得出现原始调色板工具类
 *                                破坏示例：`bg-blue-100`、`text-slate-700`
 *   3) src 下所有 .tsx           不得出现允许集外的 `rounded-*`
 *                                允许集：sm|md|lg|pill|full|none（含方向角 t/r/b/l-*）
 *                                破坏示例：`rounded-2xl`、任意值 `rounded-[10px]`
 *   4) src/app 下的 page.tsx     不得自写 `<h1`
 *                                破坏示例：第三套页头（P2 已归一为 ui/PageHeader）
 *
 * 白名单**点名文件 + 写理由**，不允许通配：写理由才逼着人解释「为什么这个文件例外」，
 * 通配会让例外悄悄扩散。被列入白名单的文件在该条规则下整文件豁免。
 * 若白名单条目在当前代码里已经不命中任何违规，脚本会提示（条目可以删了）。
 *
 * 扫的是原始文本，注释里也扫。这是故意的：假阳性只是改个措辞，假阴性会真的放行，
 * 后者的代价更高。
 *
 * 用法：node scripts/check-design-system.mjs      # 退出码 0 = 通过，1 = 有违规
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, "..");
const REPO = resolve(FRONTEND, "..");

const posix = (p) => p.split(sep).join("/");
const rel = (abs) => posix(relative(REPO, abs));

// ---------------------------------------------------------------- 文件遍历

const SKIP_DIRS = new Set(["node_modules", ".next", ".debug-shots", "__snapshots__"]);

function walk(absDir, out = []) {
  for (const name of readdirSync(absDir)) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = join(absDir, name);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

const SRC = join(FRONTEND, "src");
const allSrc = walk(SRC);
const isTs = (f) => /\.tsx?$/.test(f);
const isTsx = (f) => /\.tsx$/.test(f);
const isApp = (f) => rel(f).startsWith("frontend/src/app/");
const isPage = (f) => isApp(f) && /\/page\.tsx$/.test(posix(f));

// ---------------------------------------------------------------- 白名单（点名 + 理由）

const WHITELISTS = {
  1: new Map([
    [
      "frontend/src/app/(main)/MainLayoutInner.tsx",
      "DEC-075 P1：全站唯一 .container-page 的宿主。容器归壳层所有，这一个文件本来就该写它。",
    ],
  ]),
  2: new Map([
    [
      "frontend/src/lib/examLevels.ts",
      "题库等级的功能性多色 chip（等级即语义色），调色板是设计的一部分，没有语义 token 能表达。",
    ],
    [
      "frontend/src/lib/avatar.ts",
      "说话人头像色板：按 id 哈希取一组固定色，颜色本身就是标识，逐个建 token 才是过度设计。",
    ],
    ["frontend/src/lib/examLevels.test.ts", "断言上面那套功能色映射，必须能写出原始类名。"],
    ["frontend/src/lib/avatar.test.ts", "断言头像色板映射，必须能写出原始类名。"],
    [
      "frontend/src/lib/utils.test.ts",
      "cn() 的合并测试，故意用调色板类名当样本（与设计系统无关）。",
    ],
  ]),
  3: new Map(),
  4: new Map([
    [
      "frontend/src/app/(main)/page.tsx",
      "首页 hero 是唯一一版自绘首屏（DEC-075 P2 已报备），不进 ui/PageHeader。",
    ],
    [
      "frontend/src/app/(main)/watch/[id]/page.tsx",
      "播放页标题参与桌面两栏版式（§6 硬边界：桌面版式不动），不是页头语义。",
    ],
    [
      "frontend/src/app/(main)/channels/[slug]/page.tsx",
      "频道 banner 上的标题压在封面图里，与 ui/PageHeader 的版式不同构。",
    ],
    [
      "frontend/src/app/(admin)/admin/login/page.tsx",
      "登录页是独立入口（无壳层、无 ui/PageHeader 可挂），自带两段标题。",
    ],
  ]),
};

// ---------------------------------------------------------------- 规则定义

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const COLOR_PREFIX =
  "bg|text|border|divide|ring|outline|fill|stroke|from|via|to|decoration|caret|accent|placeholder";
const SHADE = "50|100|200|300|400|500|600|700|800|900|950";
// 例：bg-blue-100、text-slate-700/60、border-t-red-200、decoration-sky-400
const RAW_PALETTE = new RegExp(
  `\\b(?:${COLOR_PREFIX})(?:-(?:[trblxyse]|offset))?-(?:${PALETTE})-(?:${SHADE})\\b`,
  "g"
);

// 只扫 `rounded-<后缀>` 形态：裸 `rounded` 不在本条规则的射程内（DEC-075 原文是
// 「允许集外的 `rounded-*`」），也就不会被英文散文里的 "rounded" 误伤。
const ROUNDED_TOKEN = /\brounded-[A-Za-z0-9_.\[\]%/:-]+/g;
const ROUNDED_ALLOWED = /^rounded-(?:(?:t|r|b|l|ss|se|ee|es)-)?(?:sm|md|lg|pill|full|none)$/;

const RULES = [
  {
    id: 1,
    name: "页面不得自带容器类",
    files: (f) => isApp(f) && isTs(f),
    pattern: /\bcontainer-(?:page|wide)\b/g,
  },
  {
    id: 2,
    name: "不得写原始调色板工具类",
    files: (f) => f.startsWith(SRC) && isTs(f),
    pattern: RAW_PALETTE,
  },
  {
    id: 3,
    name: "rounded-* 只允许 sm|md|lg|pill|full|none",
    files: (f) => f.startsWith(SRC) && isTsx(f),
    pattern: ROUNDED_TOKEN,
    filter: (token) => !ROUNDED_ALLOWED.test(token),
  },
  {
    id: 4,
    name: "page.tsx 不得自写 <h1",
    files: (f) => isPage(f),
    pattern: /<h1[\s>]/g,
  },
];

// ---------------------------------------------------------------- 执行

const scanned = new Set();
const violations = [];
const whitelistHits = new Map();

for (const rule of RULES) {
  const wl = WHITELISTS[rule.id] ?? new Map();
  for (const [key] of wl) whitelistHits.set(`${rule.id}:${key}`, false);

  for (const abs of allSrc) {
    if (!rule.files(abs)) continue;
    const file = rel(abs);
    scanned.add(file);

    const lines = readFileSync(abs, "utf8").split(/\r?\n/);
    let fileHit = false;
    lines.forEach((line, i) => {
      rule.pattern.lastIndex = 0;
      for (const m of line.matchAll(rule.pattern)) {
        if (rule.filter && !rule.filter(m[0])) continue;
        fileHit = true;
        if (wl.has(file)) continue; // 白名单：命中只用来提示，不报违规
        violations.push({
          rule: rule.id,
          name: rule.name,
          file,
          line: i + 1,
          col: m.index + 1,
          token: m[0],
          text: line.trim(),
        });
      }
    });
    if (fileHit && wl.has(file)) whitelistHits.set(`${rule.id}:${file}`, true);
  }
}

// ---------------------------------------------------------------- 输出

console.log("check-design-system：DEC-075 前端设计系统门禁（4 条规则）");
console.log(`扫描 src/ 共 ${scanned.size} 个文件（按规则去重前）`);
for (const rule of RULES) {
  const n = violations.filter((v) => v.rule === rule.id).length;
  console.log(`  规则 ${rule.id} · ${rule.name}：${n === 0 ? "通过" : `${n} 处违规`}`);
}

if (violations.length) {
  console.log("\n违规明细：");
  for (const v of violations) {
    console.log(`  ✗ [规则 ${v.rule}] ${v.file}:${v.line}:${v.col}  ${v.token}`);
    console.log(`      ${v.text}`);
  }
}

const staleWhitelist = [...whitelistHits.entries()].filter(([, hit]) => !hit);
if (staleWhitelist.length) {
  console.log("\n提示：以下白名单条目已不再命中任何违规，可以删掉：");
  for (const [key] of staleWhitelist) {
    const [id, file] = key.split(":");
    console.log(`  · 规则 ${id} · ${file}`);
  }
}

if (violations.length) {
  console.log(`\nFAIL：${violations.length} 处违规。`);
  process.exit(1);
}
console.log("\nPASS：四条规则全部通过。");
