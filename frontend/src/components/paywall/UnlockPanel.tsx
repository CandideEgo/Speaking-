/**
 * UnlockPanel — Free 用户视频解锁面板（D0 解锁制，产品设计规划 §2.2/§2.4）。
 *
 * 渲染在 watch 页播放器区域：
 *  - 有剩余次数：视频信息 + 「解锁并观看」（点击直接解锁并播放，无需二次确认）
 *  - 次数用完：升级引导态（权益列表 + 兑换码入口 + 次月恢复提示）
 */

import Link from "next/link";
import { Lock, Crown, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatDuration } from "@/lib/format";

interface UnlockPanelProps {
  title: string;
  difficultyLevel?: string | null;
  duration?: number | null;
  /** 本月剩余解锁次数（0 → 升级引导态）。 */
  remaining: number;
  quota: number;
  /** 点击「解锁并观看」。 */
  onUnlock: () => void;
  unlocking?: boolean;
}

const PRO_PERKS = [
  "所有视频无限解锁、随时观看",
  "双语字幕 + AI 词注释",
  "真题练习 + 词汇复习",
  "跟读录音",
];

export function UnlockPanel({
  title,
  difficultyLevel,
  duration,
  remaining,
  quota,
  onUnlock,
  unlocking = false,
}: UnlockPanelProps) {
  const exhausted = remaining <= 0;

  if (exhausted) {
    // 升级引导态（§2.4）：额度用完不嘲讽，给明确出路。
    return (
      <div className="h-full w-full flex items-center justify-center bg-surface-dark p-6">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-500/15 mb-4">
            <Crown size={22} className="text-brand-500" />
          </div>
          <h2 className="text-lg font-bold text-white">开通 Pro</h2>
          <p className="mt-1.5 text-sm text-white/70">
            本月 {quota} 次解锁已用完，开通 Pro，无限观看所有视频
          </p>
          <ul className="mt-4 space-y-2 text-left text-sm text-white/85">
            {PRO_PERKS.map((perk) => (
              <li key={perk} className="flex items-start gap-2">
                <Check size={15} className="mt-0.5 shrink-0 text-success" />
                <span>{perk}</span>
              </li>
            ))}
          </ul>
          <Link href="/redeem" className="block mt-5">
            <Button fullWidth>输入兑换码激活</Button>
          </Link>
          <Link
            href="/upgrade"
            className="inline-block mt-3 text-[13px] text-white/60 hover:text-white transition-colors"
          >
            了解 Pro 会员
          </Link>
          <p className="mt-3 text-xs text-white/45">下月 1 日恢复 {quota} 次解锁机会</p>
        </div>
      </div>
    );
  }

  // 有余额态（§2.2 流程图）。
  return (
    <div className="h-full w-full flex items-center justify-center bg-surface-dark p-6">
      <div className="w-full max-w-sm text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/10 mb-4">
          <Lock size={22} className="text-white/80" />
        </div>
        <h2 className="text-lg font-bold text-white">解锁这个视频</h2>
        <p className="mt-2 text-sm text-white/85 font-medium line-clamp-2">《{title}》</p>
        <p className="mt-1 text-xs text-white/55">
          {[difficultyLevel, duration ? formatDuration(duration) : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="mt-3 text-[13px] text-white/70">解锁后可随时观看，不重复消耗</p>
        <p className="mt-1 text-[13px] text-white/70">
          本月剩余解锁次数：<span className="font-semibold text-white">{remaining}</span>
        </p>
        <Button fullWidth className="mt-5" onClick={onUnlock} disabled={unlocking}>
          {unlocking ? "解锁中..." : "解锁并观看"}
        </Button>
        <Link
          href="/upgrade"
          className="inline-block mt-3 text-[13px] text-white/60 hover:text-white transition-colors"
        >
          开通 Pro，无限解锁所有视频
        </Link>
      </div>
    </div>
  );
}
