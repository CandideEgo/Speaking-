import type { Metadata } from "next";
import { siteConfig } from "@/lib/siteConfig";
import { LegalLayout, type LegalSection } from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "用户协议 - SeeWord",
  description: "SeeWord 用户协议",
};

// 主体名称：已配置则显示具体名称，未配置时用中性表述（上线可用，
// 避免向最终用户暴露"待补充"这类开发态文案）。
const operatorName = siteConfig.companyName || "本站运营方";
const uscc = siteConfig.companyUscc;

const SECTIONS: LegalSection[] = [
  { id: "sec-1", title: "一、服务性质" },
  { id: "sec-2", title: "二、服务与费用" },
  { id: "sec-3", title: "三、账号" },
  { id: "sec-4", title: "四、内容与知识产权" },
  { id: "sec-5", title: "五、免责声明" },
  { id: "sec-6", title: "六、协议变更" },
];

export default function TermsPage() {
  return (
    <LegalLayout title="用户协议" updatedAt="2026 年 9 月 19 日" sections={SECTIONS}>
      <section id="sec-1" className="space-y-2 scroll-mt-10">
        <h2 className="text-base font-semibold text-ink">一、服务性质</h2>
        <p>
          SeeWord（以下简称"本站"）由 {operatorName}
          {uscc ? `（统一社会信用代码：${uscc}）` : ""} 运营，是面向中文用户的英语学习工具。 本站为
          <strong>非经营性工具展示平台</strong>
          ，提供视频字幕、词汇学习、翻译注释等功能展示与使用，
          <strong>不涉及任何资金收付</strong>。
        </p>
      </section>

      <section id="sec-2" className="space-y-2 scroll-mt-10">
        <h2 className="text-base font-semibold text-ink">二、服务与费用</h2>
        <p>
          本站当前处于内测阶段，全部功能对内测用户免费开放，不收取任何费用，
          站内亦不提供在线支付功能。内测期间不销售任何会员或付费权益。
        </p>
        <p>
          内测结束后如需调整收费方式，本站将提前在本页面公示，并明确收费项目、
          价格与生效时间；未公示前不向用户收取任何费用。
        </p>
      </section>

      <section id="sec-3" className="space-y-2 scroll-mt-10">
        <h2 className="text-base font-semibold text-ink">三、账号</h2>
        <p>
          用户应使用真实信息注册账号，妥善保管账号与密码。因账号保管不善造成的损失由用户自行承担。
          本站有权对违反法律法规或本协议的账号采取限制或封禁措施。
        </p>
      </section>

      <section id="sec-4" className="space-y-2 scroll-mt-10">
        <h2 className="text-base font-semibold text-ink">四、内容与知识产权</h2>
        <p>
          本站引用的视频内容来源自第三方平台，相关权利归原作者所有，本站仅用于学习演示。
          用户在本站产生的学习数据归用户本人所有。未经授权，不得复制、转载或商用本站的原创内容。
        </p>
      </section>

      <section id="sec-5" className="space-y-2 scroll-mt-10">
        <h2 className="text-base font-semibold text-ink">五、免责声明</h2>
        <p>
          本站提供的翻译、词汇标注、AI 词汇注释等功能仅供参考学习，不构成专业语言评判。
          因网络、设备或第三方服务原因导致的功能中断，本站不承担责任。
        </p>
      </section>

      <section id="sec-6" className="space-y-2 scroll-mt-10">
        <h2 className="text-base font-semibold text-ink">六、协议变更</h2>
        <p>
          本站可根据法律法规及运营需要更新本协议，更新后将在本页面公示。继续使用即视为接受变更。
        </p>
      </section>
    </LegalLayout>
  );
}
