/**
 * 登录密码规则的唯一家：提交判据、强度条、文案共用同一份口径。
 *
 * 与后端 `app/core/security.py::validate_password_strength` 一致：≥ 8 位且同时含
 * 大写字母、小写字母、数字（**不要求特殊字符**）。
 */

export const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

/** 提交被拒时的统一文案。 */
export const PASSWORD_RULE_MESSAGE = "密码至少 8 位，需同时包含大写字母、小写字母和数字";

/** 输入框下方的静态提示（不带「密码」前缀，紧跟标签用）。 */
export const PASSWORD_HINT = "至少 8 位，需同时包含大写字母、小写字母和数字";

/**
 * 强度：0 空 / 1 弱（不合格且不足 8 位）/ 2 中（不合格）/ 3 强。
 *
 * **3 ⟺ 能提交**：第三档直接复用 `PASSWORD_RE`，而不是另立一套加分项 ——
 * 曾经的实现给「小写+大写」与「数字+特殊字符」加分，于是 `Abcdefg!`（提交必被拒）
 * 显示「强」，而合法的 `Abcdefgh1` 反而显示「中」，UI 与真正的规则互相打脸。
 */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 {
  if (!password) return 0;
  if (PASSWORD_RE.test(password)) return 3;
  return password.length >= 8 ? 2 : 1;
}
