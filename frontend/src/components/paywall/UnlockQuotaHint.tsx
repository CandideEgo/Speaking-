"use client";

/**
 * UnlockQuotaHint — D11 转化触点：Free 额度小字入口（产品设计规划 §4-D11）。
 *
 * 挂在首页/发现页筛选栏旁：
 *  - 有剩余次数："本月剩余 N 次解锁"
 *  - 次数用完："本月解锁已用完 · 开通 Pro"（更强的升级引导）
 * 点击进 /upgrade。Pro / 未登录 / 加载中传 null，不渲染。
 * 数据由页面已拉取的 useUnlockedIds 传入，避免重复请求。
 */

import Link from "next/link";
import { Crown, KeyRound } from "lucide-react";
import type { UnlockedInfo } from "@/hooks/useUnlockedIds";

interface UnlockQuotaHintProps {
  info: UnlockedInfo | null;
}

export function UnlockQuotaHint({ info }: UnlockQuotaHintProps) {
  if (!info) return null;

  const exhausted = info.remaining <= 0;

  return (
    <Link
      href="/upgrade"
      className={`inline-flex items-center gap-1 text-xs font-medium transition-colors ${
        exhausted ? "text-brand-500 hover:text-brand-600" : "text-muted hover:text-ink"
      }`}
    >
      {exhausted ? <Crown size={12} /> : <KeyRound size={12} />}
      {exhausted ? "本月解锁已用完 · 开通 Pro" : `本月剩余 ${info.remaining} 次解锁`}
    </Link>
  );
}
