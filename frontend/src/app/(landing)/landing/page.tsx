import type { Metadata } from "next";
import { LandingContent } from "@/components/landing/LandingContent";
import { AuthedRedirectGate } from "@/components/landing/AuthedRedirectGate";
import { siteConfig } from "@/lib/siteConfig";

export const metadata: Metadata = {
  title: `${siteConfig.brandName} — 看视频，学英语`,
  description:
    "通过真实英语视频学习词汇与表达：双语字幕、AI 练习题、SM-2 间隔复习，一站式沉浸式英语学习平台。",
};

/**
 * Public landing page — server-rendered (RSC).
 *
 * Previously this was a client component that showed a spinner until the
 * auth store finished initializing, delaying first paint for everyone and
 * leaving nothing for crawlers. Now the marketing content streams straight
 * from the server; {@link AuthedRedirectGate} bounces logged-in visitors to
 * the app without blocking render.
 */
export default function LandingPage() {
  return (
    <>
      <AuthedRedirectGate />
      <LandingContent />
    </>
  );
}
