import Link from "next/link";
import type { Metadata } from "next";
import { siteConfig } from "@/lib/siteConfig";

export const metadata: Metadata = {
  title: "隐私政策 — Speaking",
  description: "Speaking 隐私政策",
};

const operatorName = siteConfig.companyName || "（个体工商户名称待补充）";
const uscc = siteConfig.companyUscc;

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-canvas px-4 py-12">
      <article className="container-page max-w-3xl">
        <h1 className="font-display text-3xl font-normal text-ink tracking-display-md">
          隐私政策
        </h1>
        <p className="mt-2 text-sm text-muted">最后更新：2026 年 6 月 29 日</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-body">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-ink">一、政策适用</h2>
            <p>
              本政策适用于 {operatorName}
              {uscc ? `（统一社会信用代码：${uscc}）` : ""} 运营的
              Speaking（以下简称"本站"）。
              本站为非经营性工具展示平台，重视用户隐私保护。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-ink">二、收集的信息</h2>
            <p>在您使用本站时，我们可能收集以下信息：</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>账号信息：邮箱、昵称、加密后的密码；</li>
              <li>
                学习数据：观看记录、口语练习音频与评分、词汇本、学习目标；
              </li>
              <li>
                设备与日志：访问时间、浏览器类型等用于运行维护的基础信息。
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-ink">三、信息用途</h2>
            <p>
              收集的信息仅用于提供学习功能、改进服务质量与保障账号安全，不出售给任何第三方。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-ink">四、第三方服务</h2>
            <p>
              为提供 AI 评测、翻译、字幕转写等功能，本站会调用第三方 AI
              与语音识别服务处理必要的数据。
              视频内容来源自第三方平台。这些服务有其各自的隐私政策，本站不对其数据处理行为承担责任。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-ink">
              五、数据存储与安全
            </h2>
            <p>
              我们采取合理的技术与管理措施保护您的信息，但互联网传输不存在绝对安全，我们无法保证百分之百安全。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-ink">六、您的权利</h2>
            <p>
              您有权访问、更正或删除自己的账号与学习数据。如需行使上述权利，可通过本站联系方式提出。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-ink">七、政策更新</h2>
            <p>本政策可能更新，更新后将在本页面公示。</p>
          </section>
        </div>

        <div className="mt-10 border-t border-hairline pt-6 text-sm text-muted">
          <Link href="/" className="text-brand-500 hover:underline">
            ← 返回首页
          </Link>
        </div>
      </article>
    </main>
  );
}
