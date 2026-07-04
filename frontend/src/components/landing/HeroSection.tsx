"use client";

import { ArrowRight, Play, Check, Zap } from "lucide-react";
import { LinkButton } from "@/components/ui/LinkButton";
import { Eyebrow } from "@/components/ui/Eyebrow";

export function HeroSection() {
  return (
    <section className="pt-32 pb-20 lg:pt-24 lg:pb-20">
      <div className="container-page">
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-14 items-center">
          {/* Copy */}
          <div>
            <Eyebrow>用真实视频学英语 · 双语字幕 + 词汇</Eyebrow>
            <h1 className="!text-[36px] sm:!text-[52px] lg:!text-[68px] !font-black !tracking-[-0.04em] !leading-none mt-6 mb-6">
              Learn English
              <br />
              with <em className="not-italic text-brand-500">Real Speech.</em>
            </h1>
            <p className="text-lg text-muted leading-relaxed max-w-[500px] mb-9">
              粘贴英文视频链接，自动生成双语字幕与生词标注，SM-2
              间隔复习帮你记住。还能在社区发现、贡献更多真实视频。
            </p>
            <div className="flex gap-3 flex-wrap">
              <LinkButton
                href="/register"
                size="lg"
                icon={ArrowRight}
                iconRight
              >
                进入应用
              </LinkButton>
              <LinkButton href="/browse" variant="outline" size="lg">
                浏览视频内容
              </LinkButton>
            </div>
            <div className="flex gap-9 mt-12 pt-7 border-t border-hairline">
              <div>
                <div className="text-[28px] font-extrabold tracking-display-md">
                  12,400+
                </div>
                <div className="text-[13px] text-muted mt-0.5">精选视频</div>
              </div>
              <div>
                <div className="text-[28px] font-extrabold tracking-display-md">
                  98%
                </div>
                <div className="text-[13px] text-muted mt-0.5">字幕准确率</div>
              </div>
              <div>
                <div className="text-[28px] font-extrabold tracking-display-md">
                  4.9 ★
                </div>
                <div className="text-[13px] text-muted mt-0.5">用户评分</div>
              </div>
            </div>
          </div>

          {/* Player mock */}
          <div className="relative">
            <div className="bg-ink rounded-xl overflow-hidden shadow-lift aspect-[4/3] relative">
              {/* Gradient scrim */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(120% 80% at 80% 10%, rgba(255,90,31,0.4), transparent 60%), radial-gradient(100% 100% at 10% 100%, rgba(99,102,241,0.3), transparent 55%), linear-gradient(160deg, #1a1a1a, #000)",
                }}
              />
              {/* Play button */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[66px] h-[66px] rounded-full bg-white/96 flex items-center justify-center shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
                <Play size={26} fill="#0a0a0a" stroke="none" />
              </div>
              {/* Subtitle bar */}
              <div className="absolute left-3.5 right-3.5 bottom-3.5 bg-white/10 backdrop-blur-[10px] border border-white/15 rounded-lg p-3 text-white">
                <div className="text-xs font-semibold flex justify-between">
                  <span>How to speak so people listen</span>
                  <span>3:42 / 12:08</span>
                </div>
                <div className="h-[3px] bg-white/20 rounded mt-2 relative">
                  <div className="absolute left-0 top-0 h-full w-[38%] bg-brand-500 rounded" />
                </div>
              </div>
            </div>

            {/* Float card 1 */}
            <div className="absolute -right-4 top-[16%] bg-canvas rounded-lg shadow-lift p-3 flex items-center gap-2.5 text-[13px] hidden md:flex">
              <div className="w-[34px] h-[34px] rounded-[9px] bg-success-soft text-success flex items-center justify-center flex-shrink-0">
                <Check size={17} />
              </div>
              <div>
                <div className="font-semibold leading-tight">生词 1,240</div>
                <div className="text-[11px] text-muted">SM-2 间隔复习</div>
              </div>
            </div>

            {/* Float card 2 */}
            <div className="absolute -left-[18px] bottom-[14%] bg-canvas rounded-lg shadow-lift p-3 flex items-center gap-2.5 text-[13px] hidden md:flex">
              <div className="w-[34px] h-[34px] rounded-[9px] bg-brand-50 text-brand-500 flex items-center justify-center flex-shrink-0">
                <Zap size={17} />
              </div>
              <div>
                <div className="font-semibold leading-tight">社区创作</div>
                <div className="text-[11px] text-muted">用户贡献视频</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
