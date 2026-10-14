"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { CODE_COOLDOWN_SECONDS, cooldownRemaining, PHONE_RE, type SentCode } from "@/lib/smsCode";

/**
 * 短信验证码的共享逻辑：给**当前号码**发码、跟踪 60s 冷却。注册 / 登录 / 找回密码 /
 * 换绑手机号四个表单共用（都打 `POST /api/v1/auth/sms/send-code`）。
 *
 * `phone` 是入参而非每次调用时传参：后端的 60s 冷却与发码失败的错误都是 **per-phone**
 * 的（`sms:cooldown:{phone}:{purpose}`），所以这里记住「上一次尝试的号码」，只有当前号码
 * 与它一致时才把冷却／错误报给调用方 —— 用户输错号、改正后按钮立刻可点，上一个号码的
 * 错误也立刻消失。做成入参是**结构性**的：漏重置在类型上就不成立，不靠调用方自觉。
 *
 * 返回 `cooldown`（剩余秒数）、`sending`、`error`（最后一次发码失败的原因）与
 * `sendCode(purpose)`。
 */
export function useSmsCode(phone = "") {
  const [sent, setSent] = useState<SentCode | null>(null);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<{ phone: string; message: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // 冷却倒数：有在途冷却时才走表，到点自行停下（不让空转的定时器陪跑）。
  useEffect(() => {
    if (!sent) return;
    const t = setInterval(() => {
      const at = Date.now();
      setNow(at);
      if (at >= sent.expiresAt) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [sent]);

  async function sendCode(purpose: string = "auth") {
    const target = phone;
    if (!PHONE_RE.test(target)) {
      setFailure({ phone: target, message: "请输入正确的手机号" });
      return false;
    }
    setFailure(null);
    setSending(true);
    try {
      await api<{ message: string }>("/api/v1/auth/sms/send-code", {
        method: "POST",
        body: JSON.stringify({ phone: target, purpose }),
      });
      const at = Date.now();
      setSent({ phone: target, expiresAt: at + CODE_COOLDOWN_SECONDS * 1000 });
      setNow(at);
      return true;
    } catch (err) {
      setFailure({ phone: target, message: apiErrorMessage(err, "验证码发送失败，请稍后再试") });
      return false;
    } finally {
      setSending(false);
    }
  }

  return {
    cooldown: cooldownRemaining(sent, phone, now),
    sending,
    error: failure && failure.phone === phone ? failure.message : "",
    sendCode,
    /** 手动清掉上一次发码失败的错误（例如切了登录方式，那个错误已与当前操作无关）。 */
    clearError: () => setFailure(null),
  };
}
