"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";

const CODE_COOLDOWN = 60;

/**
 * Shared SMS verification-code logic: send a code to a phone and track the
 * 60s per-phone cooldown. Used by the register, forgot-password, and
 * change-phone forms (all reuse `POST /api/v1/auth/sms/send-code`).
 *
 * Returns the cooldown counter, a `sending` flag, a `sendCode(phone, purpose)` action,
 * and any error from the last send attempt.
 */
export function useSmsCode() {
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // Countdown timer for the send-code button.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function sendCode(phone: string, purpose: string = "register") {
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setError("请输入正确的手机号");
      return false;
    }
    setError("");
    setSending(true);
    try {
      await api<{ message: string }>("/api/v1/auth/sms/send-code", {
        method: "POST",
        body: JSON.stringify({ phone, purpose }),
      });
      setCooldown(CODE_COOLDOWN);
      return true;
    } catch (err) {
      setError(apiErrorMessage(err, "验证码发送失败，请稍后再试"));
      return false;
    } finally {
      setSending(false);
    }
  }

  return { cooldown, sending, error, sendCode };
}
