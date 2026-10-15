/**
 * Auth store 共享工具 - 用户端 `authStore` 与管理端 `adminAuthStore` 复用。
 *
 * 两个 store 的 token 读写、JWT 解码、过期判定、key 迁移逻辑一致，差异仅在
 * token key 名、重定向目标与 logout side-effect（见各 store）。此处收敛真正
 * 相同的纯函数，避免双份维护。
 */

export interface BaseAuthUser {
  sub?: string;
  name?: string;
  exp?: number;
  iat?: number;
  // JWT claims（sub/exp/iat/jti）；**不含 role** - role 不在 JWT 里，
  // 由 /users/me 的 DB 查询返回（admin 鉴权经 get_admin_user 叠加 role 检查）。
  [key: string]: unknown;
}

/**
 * 一次性迁移 localStorage token key（品牌改名 speaking_* -> seeword_*）。
 * 逐对搬运：旧 key 有值则写到新 key 并删旧 key。
 */
export function migrateTokenKeys(mappings: [string, string][]): void {
  if (typeof window === "undefined") return;
  for (const [oldKey, newKey] of mappings) {
    const val = localStorage.getItem(oldKey);
    if (val) {
      localStorage.setItem(newKey, val);
      localStorage.removeItem(oldKey);
    }
  }
}

/**
 * 由 token + 解码后的 user 推导 isAuthenticated。
 * token 存在且（若有 exp 则未过期）才为 true。
 */
export function deriveAuthenticated<U extends BaseAuthUser>(
  token: string | null,
  user: U | null
): boolean {
  if (!token || !user) return false;
  if (typeof user.exp === "number") {
    return user.exp >= Math.floor(Date.now() / 1000);
  }
  return true;
}

/**
 * 用户端会话镜像 cookie 名 —— `proxy.ts`（登录墙）、`authStore`、
 * `useRedirectIfAuthenticated` 三处必须同源，故收敛到此常量。
 */
export const AUTH_COOKIE_NAME = "seeword_token";

/**
 * 镜像 cookie 的**读侧**检查，与写侧的 `setSession` / `clearSession` 成对。
 *
 * `proxy.ts` 的登录墙判据只有一条：cookie 存在**且非空**（不解码 JWT、不查
 * DB）。所以客户端能同步复算同一判定，不必先发一次注定被 302 弹回的跳转。
 *
 * 与 middleware 严格对齐的两点语义：
 * - **空值算缺失**：`seeword_token=` 时 `request.cookies.get(...)?.value === ""`，
 *   被 `proxy.ts` 的 `if (!token)` 判为未登录，所以这里也必须判为缺失；
 * - **名字精确匹配**：`seeword_token=` 不得匹配 `seeword_admin_token=`。
 *
 * 不做 `decodeURIComponent`：本函数只判存在性，编码不改变存在性。
 *
 * 边界：这是「浏览器会不会带上 cookie」的代理指标，不是等价物 ——
 * `document.cookie` 看不到 HttpOnly cookie（本仓库无服务端 Set-Cookie，已核对
 * `backend/app` 与两份 nginx 配置）。
 */
export function hasAuthCookieMirror(name: string): boolean {
  if (typeof document === "undefined") return false;
  const prefix = `${name}=`;
  // 扫描全部分段而非取首个：同名重复 cookie 在 document.cookie 与 Cookie 头里
  // 的顺序不保证一致。本仓库只写 path=/ 的唯一一份，这里是兜底。
  return document.cookie.split(";").some((segment) => {
    const trimmed = segment.trim();
    return trimmed.startsWith(prefix) && trimmed.length > prefix.length;
  });
}

/**
 * 把 auth token 镜像到同名 cookie，供 Next.js middleware 读取（D0 登录墙）。
 *
 * middleware 运行在服务端，看不到 localStorage；cookie 仅作存在性镜像，
 * 事实来源仍是 localStorage（API 调用照旧用 Authorization 头）。
 * 传 null 则删除 cookie（登出/失效时调用）。
 *
 * **私有实现细节**，别 `export` 它：对外的入口是下面三个成对操作
 * （`setSession` / `clearSession` / `remirrorSessionCookie`），它们保证 cookie
 * 永远与 localStorage 一起动。这个函数本身只写一个家，单独调用就会造出
 * 「看着已登录、每个请求 401」的错位状态。`scripts/check-session-writes.mjs`
 * 守着这条线。
 */
function syncAuthCookie(name: string, token: string | null, maxAgeDays = 30): void {
  if (typeof document === "undefined") return;
  if (token) {
    document.cookie = `${name}=${encodeURIComponent(token)}; path=/; max-age=${maxAgeDays * 86400}; SameSite=Lax`;
  } else {
    document.cookie = `${name}=; path=/; max-age=0`;
  }
}

/** 一份会话存放的两个 localStorage key。 */
export interface SessionKeys {
  /** access token 的 key —— 同时也是镜像 cookie 的名字（同名镜像，D0）。 */
  token: string;
  /** refresh token 的 key。 */
  refreshToken: string;
}

/** 用户端会话存放位置。 */
export const USER_SESSION_KEYS: SessionKeys = {
  token: AUTH_COOKIE_NAME,
  refreshToken: "seeword_refresh_token",
};

/**
 * 管理端会话存放位置 —— 与用户端**两套独立会话**（登出其一不影响另一个）。
 */
export const ADMIN_SESSION_KEYS: SessionKeys = {
  token: "seeword_admin_token",
  refreshToken: "seeword_admin_refresh_token",
};

/**
 * 开启会话：**同时**写 localStorage（真身）与镜像 cookie（边缘登录墙要读）。
 *
 * 这是全站唯一允许同时写这两处的地方。分开写会留下一类几乎无法复现的状态：
 * 用户看着是登录的（localStorage 有 token，页面按已登录渲染），而每个请求都被
 * 登录墙 307 弹回 /login —— 这个 bug 修过一次，见
 * `components/auth/RedirectStuckState.tsx` 与 `e2e/login-redirect-loop.spec.ts`。
 * 所以不要绕过它去调 `syncAuthCookie`（它已私有），也不要自己 `localStorage.setItem`
 * 这两个 key。
 */
export function setSession(keys: SessionKeys, token: string, refreshToken?: string | null): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(keys.token, token);
  syncAuthCookie(keys.token, token);
  if (refreshToken) {
    localStorage.setItem(keys.refreshToken, refreshToken);
  } else {
    localStorage.removeItem(keys.refreshToken);
  }
}

/**
 * 结束会话：两个存放位置都清干净。
 *
 * 顺带扫掉「有 refresh token 但没有 access token」的孤儿（`initialize()` 的
 * `!token` 分支会走到这里），否则它会一直躺在 localStorage 里被反复忽略。
 */
export function clearSession(keys: SessionKeys): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(keys.token);
  localStorage.removeItem(keys.refreshToken);
  syncAuthCookie(keys.token, null);
}

/**
 * 只补写镜像 cookie，**不碰** localStorage。
 *
 * 用于「localStorage 已经是对的、但 cookie 被浏览器拦掉/过期了」这一种恢复路径：
 * 此时不能借 `setSession` 顺手写一遍 localStorage —— 调用方手上只有 access
 * token，传 `refreshToken: null` 会顺手删掉真的 refresh token。
 */
export function remirrorSessionCookie(keys: SessionKeys, token: string | null): void {
  if (typeof window === "undefined") return;
  syncAuthCookie(keys.token, token);
}

/** `/api/v1/auth/sms/login` 响应里决定去向的字段。 */
export interface PostAuthResult {
  is_new_user: boolean;
  user: { onboarding_completed: boolean };
}

/**
 * 认证成功后去哪 —— 注册页与登录页共用这一条规则（唯一执行点）。
 *
 * - **新号**：先设置登录密码（可跳过）再进引导。建号时 `hashed_password` 为 NULL
 *   （`auth.py` 的 `sms/login` 建号分支），所以 `/set-password` 的「首次设置」分支
 *   必然成立，不传 `current_password` 也安全。引导必须排在密码之前，故此时不理会 next。
 * - **老号未完成引导**：直接进引导。**不走设置密码页** —— 老号可能已有密码，而该页
 *   只发 `new_password`，后端 `change-password` 会要求 `current_password` 并 400
 *   （英文原文会直接透传到界面）。这正是把 `is_new_user` 与 `!onboarding_completed`
 *   用 `||` 混在一起时的老 bug。
 * - **其余**：回 next。
 */
export function postAuthRedirect(
  res: PostAuthResult,
  next: string,
  from: "register" | "login"
): string {
  if (res.is_new_user) {
    return `/set-password?from=${from}&next=${encodeURIComponent("/onboarding")}`;
  }
  return res.user.onboarding_completed ? next : "/onboarding";
}

/**
 * 校验登录回跳地址（?next=）：只允许站内相对路径，防开放重定向。
 * 非法/缺失时返回默认值。
 */
export function safeNext(raw: string | null, fallback = "/"): string {
  if (!raw) return fallback;
  // 空白/控制字符必须先挡：浏览器解析 URL 前会剥掉 TAB/LF/CR，"/\t/evil.com"
  // 能通过 startsWith("/") 与 startsWith("//") 的检查，却解析成协议相对的
  // "//evil.com"（站外跳转）。
  if (/\s/.test(raw)) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  return raw;
}
