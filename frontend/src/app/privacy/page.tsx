import type { Metadata } from "next";
import { siteConfig } from "@/lib/siteConfig";
import { LegalLayout, type LegalSection } from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "隐私政策 - SeeWord",
  description: "SeeWord 隐私政策",
};

// 主体名称：已配置则显示具体名称，未配置时用中性表述（上线可用，
// 避免向最终用户暴露"待补充"这类开发态文案）。
const operatorName = siteConfig.companyName || "本站运营方";
const uscc = siteConfig.companyUscc;

const SECTIONS: LegalSection[] = [
  { id: "sec-1", title: "一、政策适用" },
  { id: "sec-2", title: "二、收集的信息" },
  { id: "sec-3", title: "三、信息用途" },
  { id: "sec-4", title: "四、第三方服务" },
  { id: "sec-5", title: "五、数据存储与安全" },
  { id: "sec-6", title: "六、您的权利" },
  { id: "sec-7", title: "七、政策更新" },
];

export default function PrivacyPage() {
  return (
    <LegalLayout title="隐私政策" updatedAt="2026 年 7 月 9 日" sections={SECTIONS}>
      <section id="sec-1" className="space-y-2 scroll-mt-10">
        <h2 className="text-base font-semibold text-ink">一、政策适用</h2>
        <p>
          本政策适用于 {operatorName}
          {uscc ? `（统一社会信用代码：${uscc}）` : ""} 运营的 SeeWord（以下简称"本站"）。
          本站为非经营性工具展示平台，重视用户隐私保护。
        </p>
      </section>

      <section id="sec-2" className="space-y-2 scroll-mt-10">
        <h2 className="text-base font-semibold text-ink">二、收集的信息</h2>
        <p>在您使用本站时，我们可能收集以下信息：</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>账号信息：手机号、昵称、加密后的密码；</li>
          <li>学习数据：观看记录、词汇本、练习记录、学习偏好；</li>
          <li>设备与日志：访问时间、浏览器类型等用于运行维护的基础信息。</li>
        </ul>
      </section>

      <section id="sec-3" className="space-y-2 scroll-mt-10">
        <h2 className="text-base font-semibold text-ink">三、信息用途</h2>
        <p>收集的信息仅用于提供学习功能、改进服务质量与保障账号安全，不出售给任何第三方。</p>
      </section>

      <section id="sec-4" className="space-y-2 scroll-mt-10">
        <h2 className="text-base font-semibold text-ink">四、第三方服务</h2>
        <p>
          为提供翻译、字幕转写、AI 词汇注释等功能，本站会调用第三方 AI
          与语音识别服务处理必要的数据。
          视频内容来源自第三方平台。这些服务有其各自的隐私政策，本站不对其数据处理行为承担责任。
        </p>
      </section>

      <section id="sec-5" className="space-y-2 scroll-mt-10">
        <h2 className="text-base font-semibold text-ink">五、数据存储与安全</h2>
        <p>
          我们采取合理的技术与管理措施保护您的信息，但互联网传输不存在绝对安全，我们无法保证百分之百安全。
        </p>
      </section>

      <section id="sec-6" className="space-y-2 scroll-mt-10">
        <h2 className="text-base font-semibold text-ink">六、您的权利</h2>
        <p>
          您有权访问、更正或删除自己的账号与学习数据。如需行使上述权利，可通过本站联系方式提出。
        </p>
      </section>

      <section id="sec-7" className="space-y-2 scroll-mt-10">
        <h2 className="text-base font-semibold text-ink">七、政策更新</h2>
        <p>本政策可能更新，更新后将在本页面公示。</p>
      </section>
    </LegalLayout>
  );
}
