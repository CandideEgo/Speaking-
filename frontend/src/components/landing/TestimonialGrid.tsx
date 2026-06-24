import Link from "next/link";

const testimonials = [
  {
    quote: "终于找到一个不靠死记硬背的学英语方式。每天看一段真实视频，口语进步肉眼可见。",
    name: "Lin Wei",
    role: "备考雅思 · 3 个月",
    initial: "L",
    color: "bg-indigo",
  },
  {
    quote: "AI 发音评测比我请的私教还细致，能精确到每个音节。性价比太高了。",
    name: "Maria Chen",
    role: "外企工作 · 6 个月",
    initial: "M",
    color: "bg-brand-500",
  },
  {
    quote: "字幕跟读功能太赞了，以前看美剧只能当娱乐，现在每一句都能学到东西。",
    name: "Zhang Yu",
    role: "大学生 · 1 年",
    initial: "Z",
    color: "bg-success",
  },
];

export function TestimonialGrid() {
  return (
    <section className="py-[88px] bg-surface-soft">
      <div className="container-page">
        <div className="text-center mb-14">
          <span className="text-[13px] font-bold text-brand-500 uppercase tracking-[0.04em]">
            用户评价
          </span>
          <h2 className="!text-[44px] !font-extrabold !tracking-[-0.03em] !leading-tight mt-3.5">
            学习者都在说
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[18px]">
          {testimonials.map((t) => (
            <div key={t.name} className="bg-canvas border border-hairline rounded-lg p-7">
              <div className="text-warning text-[15px] tracking-[2px] mb-3">★★★★★</div>
              <p className="text-sm text-body leading-relaxed mb-[18px]">"{t.quote}"</p>
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-full ${t.color} text-on-primary flex items-center justify-center font-bold text-[13px]`}
                >
                  {t.initial}
                </div>
                <div>
                  <div className="text-[13px] font-semibold">{t.name}</div>
                  <div className="text-xs text-muted">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
