import Link from "next/link";

export function FinalCTA() {
  return (
    <section className="py-[88px]">
      <div className="container-page">
        <div className="bg-ink rounded-2xl overflow-hidden relative px-6 sm:px-10 py-14 text-center">
          {/* Decorative gradient */}
          <div
            className="absolute inset-0 opacity-30"
            style={{
              background:
                "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(255,90,31,0.6), transparent 70%)",
            }}
          />
          <div className="relative z-10">
            <h2 className="!text-[28px] sm:!text-[42px] !font-extrabold !tracking-[-0.03em] !leading-tight text-on-dark mb-4">
              今天开始，开口说英语
            </h2>
            <p className="text-[17px] text-on-dark-soft mb-9 max-w-[500px] mx-auto">
              免费注册，无需信用卡。12,400+ 精选视频等着你。
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Link href="/register" className="btn-primary !py-3 !px-7">
                免费试用
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
              </Link>
              <Link
                href="/browse"
                className="inline-flex items-center gap-2 rounded-sm px-7 py-3 text-sm font-semibold bg-white/10 text-on-dark border border-white/20 hover:bg-white/20 transition-colors duration-150"
              >
                浏览视频内容
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
