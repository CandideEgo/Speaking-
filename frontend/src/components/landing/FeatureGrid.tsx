import { Mic, Star } from "lucide-react";

const features = [
  {
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 6h16M4 12h10M4 18h7" />
        <circle cx="19" cy="17" r="2" />
      </svg>
    ),
    title: "智能双语字幕",
    desc: "逐句中英对照，生词点击即查，长按看语法解析。跟读字幕还能高亮当前句，学得更准。",
    color: "bg-brand-500",
  },
  {
    icon: <Mic size={24} />,
    title: "AI 口语评测",
    desc: "实时给出发音、流利度、完整度三项分数，标出读不准的音节，精准反馈帮你快速提升。",
    color: "bg-indigo",
  },
  {
    icon: <Star size={24} />,
    title: "理解力测验",
    desc: "填空、听写、翻译多模式切换，巩固每段视频。错题自动加入复习，记忆更牢固。",
    color: "bg-success",
  },
];

export function FeatureGrid() {
  return (
    <section className="py-[88px]">
      <div className="container-page">
        <div className="text-center max-w-[640px] mx-auto mb-14">
          <span className="text-[13px] font-bold text-brand-500 uppercase tracking-[0.04em]">
            核心功能
          </span>
          <h2 className="!text-[44px] !font-extrabold !tracking-[-0.03em] !leading-tight mt-3.5 mb-4">
            看 · 说 · 懂，三位一体
          </h2>
          <p className="text-[17px] text-muted leading-relaxed">
            沉浸式双语字幕阅读，AI
            实时评测发音，智能理解测验——一段视频，完整学习闭环。
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[18px]">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-canvas border border-hairline rounded-lg p-[30px] hover:-translate-y-1 hover:shadow-lift hover:border-transparent transition-all duration-150"
            >
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center mb-[18px] text-on-primary ${f.color}`}
              >
                {f.icon}
              </div>
              <h3 className="!text-[19px] !font-bold !tracking-tight mb-2">
                {f.title}
              </h3>
              <p className="text-muted text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
