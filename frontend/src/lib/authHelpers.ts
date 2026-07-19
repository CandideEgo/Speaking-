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
