export function TrustStrip() {
  const stats = [
    "WhisperX 双语字幕",
    "SM-2 间隔复习",
    "ECDICT 考级词汇标注",
    "社区真实视频",
    "兑换码激活会员",
  ];

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
