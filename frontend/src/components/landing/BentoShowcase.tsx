export function BentoShowcase() {
  return (
    <section id="showcase" className="py-[88px] bg-surface-soft">
      <div className="container-page">
        <div className="text-center mb-14">
          <span className="text-[13px] font-bold text-brand-500 uppercase tracking-[0.04em]">
            产品一览
          </span>
          <h2 className="!text-[44px] !font-extrabold !tracking-[-0.03em] !leading-tight mt-3.5">
            每个细节都在帮你进步
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {/* Player (large) */}
          <div className="sm:col-span-2 md:col-span-2 bg-ink rounded-xl p-7 min-h-[300px] flex flex-col justify-between text-on-dark">
            <div>
              <div className="text-[13px] text-on-dark-soft mb-1.5">播放器</div>
              <h3 className="text-[22px] font-bold tracking-tight mb-3">
                沉浸式播放
              </h3>
              <p className="text-[13px] text-on-dark-soft leading-relaxed max-w-[340px]">
                逐句双语字幕，AB
                循环复读，变速播放，一键收藏生词——看视频就是学英语。
              </p>
            </div>
            <div className="flex gap-2 mt-5">
              <span className="inline-flex items-center px-3 py-1 rounded-pill bg-white/10 text-[11px] font-semibold">
                AB 循环
              </span>
              <span className="inline-flex items-center px-3 py-1 rounded-pill bg-white/10 text-[11px] font-semibold">
                变速
              </span>
              <span className="inline-flex items-center px-3 py-1 rounded-pill bg-white/10 text-[11px] font-semibold">
                生词
              </span>
            </div>
          </div>

          {/* Community contributions */}
          <div className="bg-canvas border border-hairline rounded-xl p-6 flex flex-col justify-between min-h-[180px]">
            <div className="text-[13px] text-muted mb-1.5">社区贡献</div>
            <div>
              <div className="text-[22px] font-bold tracking-tight text-brand-500">
                用户提交
              </div>
              <div className="text-[13px] text-muted mt-1">
                真实视频持续积累
              </div>
            </div>
          </div>

          {/* Vocabulary */}
          <div className="bg-canvas border border-hairline rounded-xl p-6 flex flex-col justify-between min-h-[180px]">
            <div className="text-[13px] text-muted mb-1.5">词汇本</div>
            <div>
              <div className="text-[22px] font-bold tracking-tight">
                SM-2 复习
              </div>
              <div className="text-[13px] text-muted mt-1">
                生词自动归类记忆
              </div>
              <div className="flex gap-1 mt-2.5">
                {[0.84, 0.68, 0.45, 0.92, 0.7, 0.55, 0.8].map((v, i) => (
                  <div
                    key={i}
                    className="flex-1 h-1.5 rounded-full bg-surface-card overflow-hidden"
                  >
                    <div
                      className="h-full bg-success rounded-full"
                      style={{ width: `${v * 100}%` }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Data viz (wide) */}
          <div className="sm:col-span-2 md:col-span-2 bg-canvas border border-hairline rounded-xl p-6 flex flex-col min-h-[160px]">
            <div className="text-[13px] text-muted mb-3">学习趋势</div>
            <div className="flex items-end gap-1.5 flex-1">
              {[40, 55, 35, 65, 80, 60, 90, 75, 95, 70, 85, 100].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm transition-colors duration-100 bg-brand-100 hover:bg-brand-500"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
            <div className="flex justify-between mt-2 text-[11px] text-muted-soft">
              <span>一月</span>
              <span>十二月</span>
            </div>
          </div>

          {/* Community creators */}
          <div className="sm:col-span-2 md:col-span-2 bg-canvas border border-hairline rounded-xl p-6 flex flex-col min-h-[160px]">
            <div className="text-[13px] text-muted mb-3">社区创作</div>
            <div className="flex items-center gap-4">
              <div className="flex -space-x-2">
                {["bg-brand-500", "bg-indigo", "bg-success", "bg-warning"].map(
                  (color, i) => (
                    <div
                      key={i}
                      className={`w-10 h-10 rounded-full ${color} text-on-primary flex items-center justify-center text-sm font-bold border-2 border-canvas`}
                    >
                      {["看", "学", "练", "享"][i]}
                    </div>
                  ),
                )}
              </div>
              <div className="text-[13px] text-muted leading-relaxed">
                提交你喜欢的视频，经审核后发布到社区，大家一起积累真实语料。
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
