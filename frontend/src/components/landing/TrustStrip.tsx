export function TrustStrip() {
  const stats = ["★★★★★ 4.9 / 5", "12,400+ 视频", "98% 字幕准确", "36,000+ 学习者", "120+ 国家"];

  return (
    <div className="border-t border-b border-hairline py-8">
      <div className="container-page">
        <div className="flex items-center justify-center gap-6 flex-wrap text-muted-soft font-semibold text-sm">
          {stats.map((s) => (
            <span key={s} className="opacity-70">
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
