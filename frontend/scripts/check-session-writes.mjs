#!/usr/bin/env node
/**
 * check-session-writes.mjs — 会话写入的门禁（批 7 / architecture-fix-plan-2026-10）
 *
 * 为什么需要它：「已登录」在前端有两个家 —— localStorage（真身，API 调用带它）
 * 与镜像 cookie `seeword_token`（`proxy.ts` 的边缘登录墙只查它的存在性）。
 * 两者分开写就会造出一类极难复现的状态：用户看着是登录的（页面按已登录渲染），
 * 而每个请求都被登录墙 307 弹回 /login。这个 bug 修过一次，见
 * `components/auth/RedirectStuckState.tsx` 与 `e2e/login-redirect-loop.spec.ts`。
 *
 * 收敛办法是把「写两个家」封成 `lib/authHelpers.ts` 里的
 * `setSession` / `clearSession` / `remirrorSessionCookie`。本脚本守着这条线：
 * 除了 authHelpers.ts，src 下不得再出现任何一处会话写入。
 *
 * 两条规则：
 *   1) 不得写 `document.cookie`（= 赋值）
 *      破坏示例：`document.cookie = \`seeword_token=${t}\``
 *      读不算违规 —— `document.cookie` 的读是 `proxy.ts` 同谓词的客户端复算。
 *   2) 不得对会话 key 做 localStorage 写入
 *      破坏示例：`localStorage.setItem("seeword_token", t)`、
 *               `localStorage.setItem(USER_SESSION_KEYS.token, t)`
 *      src 下其它 localStorage 用途（主题、播放倍速、搜索历史…）不受影响。
 *
 * 与设计系统门禁同样的取舍：扫的是**原始文本，注释里也扫**。假阳性只是改个
 * 措辞，假阴性会真的放行。
 *
 * 白名单只有一家（`lib/authHelpers.ts`），它就是要写这两个文件的地方。
 *
 * 用法：node scripts/check-session-writes.mjs     # 退出码 0 = 通过，1 = 有违规
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, "..");
const REPO = resolve(FRONTEND, "..");

const posix = (p) => p.split(sep).join("/");
const rel = (abs) => posix(relative(REPO, abs));

const SKIP_DIRS = new Set(["node_modules", ".next", ".debug-shots", "__snapshots__"]);

function walk(absDir, out = []) {
  for (const name of readdirSync(absDir)) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = join(absDir, name);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

const SRC = join(FRONTEND, "src");

/** 唯一允许写会话的家。 */
const ALLOWED = "frontend/src/lib/authHelpers.ts";

/** 会话 key 的字面量 + 承载它们的常量名。 */
const SESSION_KEY = "(?:seeword_(?:admin_)?(?:refresh_)?token|USER_SESSION_KEYS|ADMIN_SESSION_KEYS)";

const RULES = [
  {
    id: 1,
    name: "不得写 document.cookie",
    hint: "会话镜像只能经 lib/authHelpers 的 setSession / clearSession / remirrorSessionCookie",
    pattern: /document\.cookie\s*=/g,
  },
  {
    id: 2,
    name: "不得直接写会话的 localStorage key",
    hint: "同上——两个家必须一起动，分开写就会造出「看着已登录、请求全 401」",
    pattern: new RegExp(`localStorage\\.(?:setItem|removeItem)\\s*\\([^)]*${SESSION_KEY}`, "g"),
  },
];

// ---------------------------------------------------------------- 执行

const violations = [];
let scanned = 0;
let allowedHomeIsAlive = false;

for (const abs of walk(SRC)) {
  if (!/\.tsx?$/.test(abs)) continue;
  scanned += 1;
  const file = rel(abs);
  const isHome = file === ALLOWED;

  readFileSync(abs, "utf8")
    .split(/\r?\n/)
    .forEach((line, i) => {
      for (const rule of RULES) {
        rule.pattern.lastIndex = 0;
        for (const m of line.matchAll(rule.pattern)) {
          if (isHome) {
            if (rule.id === 1) allowedHomeIsAlive = true;
            continue; // 白名单：命中即为正常
          }
          violations.push({
            rule: rule.id,
            name: rule.name,
            hint: rule.hint,
            file,
            line: i + 1,
            col: m.index + 1,
            token: m[0],
            text: line.trim(),
          });
        }
      }
    });
}

// ---------------------------------------------------------------- 输出

console.log("check-session-writes：会话写入唯一入口门禁（2 条规则）");
console.log(`扫描 src/ 共 ${scanned} 个 .ts/.tsx`);

for (const rule of RULES) {
  const n = violations.filter((v) => v.rule === rule.id).length;
  console.log(`  规则 ${rule.id} · ${rule.name}：${n === 0 ? "通过" : `${n} 处违规`}`);
}

if (!allowedHomeIsAlive) {
  // 不判失败：镜像机制可能被有意移除。但那时这两条规则已经空转，值得说一声。
  console.log(`  ⚠ ${ALLOWED} 里没有 document.cookie 赋值 —— 本门禁可能已空转，确认后可以删掉它。`);
}

if (violations.length === 0) {
  console.log("通过。");
  process.exit(0);
}

console.error(`\n${violations.length} 处违规：\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}:${v.col}  规则 ${v.rule} · ${v.name}`);
  console.error(`    ${v.text}`);
  console.error(`    → ${v.hint}\n`);
}
process.exit(1);
