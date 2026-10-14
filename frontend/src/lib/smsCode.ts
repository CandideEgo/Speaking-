/**
 * 短信验证码的共享事实：手机号格式、发送冷却的判定。
 *
 * 「一条事实只放一个家」：手机号正则原本在注册 / 登录 / `useSmsCode` / 找回密码
 * 四处各写一份（找回密码那处还比后端宽，`^1\d{10}$` 会放行 `10000000000`），
 * 冷却原本埋在 hook 的定时器里、无法单测 —— 都收到这里。
 */

/** 与后端 `SendSmsCodeRequest.phone` 的 pattern 一致。 */
export const PHONE_RE = /^1[3-9]\d{9}$/;

/** 与后端 `_SMS_COOLDOWN_SECONDS` 一致（按「号码 + 用途」计）。 */
export const CODE_COOLDOWN_SECONDS = 60;

/** 一次成功的发送：发给谁、何时解禁。 */
export interface SentCode {
  phone: string;
  /** epoch 毫秒。 */
  expiresAt: number;
}

/**
 * 距离能重发还剩几秒。
 *
 * 冷却归属于**上一次发送的号码**：当前号码不是它时返回 0。后端的冷却键本就是
 * `sms:cooldown:{phone}:{purpose}`（per-phone），所以用户输错号、改正后再发，
 * 后端本来就会放行 —— 前端不该拿上一个号码的冷却挡住它。
 */
export function cooldownRemaining(sent: SentCode | null, phone: string, now: number): number {
  if (!sent || sent.phone !== phone) return 0;
  const ms = sent.expiresAt - now;
  if (ms <= 0) return 0;
  return Math.ceil(ms / 1000);
}

/**
 * 分格输入的取值分发：从第 `start` 格起逐位写入 `raw` 里的数字（粘贴整串也走这里），
 * 返回新数组与写入结束时该聚焦的格号。
 *
 * 超出格数的多余数字被丢弃（落点会停在末格之后，由调用方 clamp）。
 * 纯函数：`SmsOtpInput` 的输入/粘贴都得走它，好让这段逻辑能被单测覆盖。
 */
export function distributeDigits(
  value: string[],
  start: number,
  raw: string
): { next: string[]; caret: number } {
  const digits = raw.replace(/\D/g, "");
  const next = [...value];
  let caret = start;
  for (const digit of digits) {
    if (caret >= next.length) break;
    next[caret] = digit;
    caret += 1;
  }
  return { next, caret };
}
