export function HeroSection() {
  return (
    <section className="pt-32 pb-20 lg:pt-24 lg:pb-20">
      <div className="container-page">
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-14 items-center">
          {/* Copy */}
          <div>
            <span className="eyebrow">
              <span className="eyebrow-pip" />
              用真实视频学英语 · AI 驱动
            </span>
            <h1 className="!text-[36px] sm:!text-[52px] lg:!text-[68px] !font-black !tracking-[-0.04em] !leading-none mt-6 mb-6">
              Learn English
              <br />
              with <em className="not-italic text-brand-500">Real Speech.</em>
            </h1>
            <p className="text-lg text-muted leading-relaxed max-w-[500px] mb-9">
              粘贴任意英文视频链接，AI
              自动生成双语字幕、口语评测和理解测验。看真实的人怎么说话，然后开口说。
            </p>
            <div className="flex gap-3 flex-wrap">
              <a href="/register" className="btn-primary !py-3 !px-6">
                进入应用
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </a>
              <a href="/browse" className="btn-outline !py-3 !px-6">
                浏览视频内容
              </a>
            </div>
            <div className="flex gap-9 mt-12 pt-7 border-t border-hairline">
              <div>
                <div className="text-[28px] font-extrabold tracking-display-md">12,400+</div>
                <div className="text-[13px] text-muted mt-0.5">精选视频</div>
              </div>
              <div>
                <div className="text-[28px] font-extrabold tracking-display-md">98%</div>
                <div className="text-[13px] text-muted mt-0.5">字幕准确率</div>
              </div>
              <div>
                <div className="text-[28px] font-extrabold tracking-display-md">4.9 ★</div>
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
                <svg width="26" height="26" viewBox="0 0 24 24" fill="#0a0a0a" stroke="none">
                  <path d="M6 4l14 8-14 8V4Z" />
                </svg>
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
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
              <div>
                <div className="font-semibold leading-tight">发音 92 分</div>
                <div className="text-[11px] text-muted">流利度 +8%</div>
              </div>
            </div>

            {/* Float card 2 */}
            <div className="absolute -left-[18px] bottom-[14%] bg-canvas rounded-lg shadow-lift p-3 flex items-center gap-2.5 text-[13px] hidden md:flex">
              <div className="w-[34px] h-[34px] rounded-[9px] bg-brand-50 text-brand-500 flex items-center justify-center flex-shrink-0">
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
                </svg>
              </div>
              <div>
                <div className="font-semibold leading-tight">连续 14 天</div>
                <div className="text-[11px] text-muted">坚持学习中</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
