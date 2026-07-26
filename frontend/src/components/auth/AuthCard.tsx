import Link from "next/link";
import { siteConfig } from "@/lib/siteConfig";
import { Subtitles, BookOpen, Mic } from "lucide-react";

const FEATURES = [
  { icon: Subtitles, text: "真实视频 + AI 双语字幕" },
  { icon: BookOpen, text: "SM-2 科学间隔复习" },
  { icon: Mic, text: "跟读录音，练口语" },
];

/**
 * Shared outer shell for the auth pages (login / register / forgot-password /
 * reset-password): split-screen layout with brand visual panel + form area.
 * Inspired by Linear/Vercel auth pages — clean, confident, brand-forward.
 */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen bg-canvas">
      {/* Left brand panel — hidden on mobile */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[42%] relative overflow-hidden bg-surface-dark flex-col justify-between p-10">
        {/* Decorative gradient orbs */}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-brand-500/20 blur-[100px]" />
        <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-brand-400/10 blur-[80px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-indigo/10 blur-[90px]" />

        {/* Logo */}
        <div className="relative z-10">
          <span className="font-display text-xl font-bold text-on-dark tracking-tight">
            {siteConfig.brandName}
          </span>
        </div>

        {/* Center content */}
        <div className="relative z-10 space-y-8">
          <h2 className="text-3xl xl:text-4xl font-bold text-on-dark leading-tight tracking-tight">
            用真实视频，
            <br />
            <span className="text-brand-400">开口说英语。</span>
          </h2>
          <div className="space-y-4">
            {FEATURES.map((f) => (
              <div key={f.text} className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08]">
                  <f.icon size={16} className="text-brand-400" />
                </div>
                <span className="text-sm text-on-dark-soft">{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Social proof */}
        <div className="relative z-10">
          <p className="text-xs text-on-dark-soft/60">「看·查·懂」三位一体学习法，每天 15 分钟</p>
        </div>
      </div>

      {/* Right form area */}
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          <div className="text-center">
            <Link
              href="/"
              aria-label={`${siteConfig.brandName} 首页`}
              className="font-display text-2xl font-bold text-ink tracking-tight lg:hidden"
            >
              {siteConfig.brandName}
            </Link>
            <h1 className="mt-4 lg:mt-0 font-display text-3xl font-bold text-ink tracking-display-md">
              {title}
            </h1>
            {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
