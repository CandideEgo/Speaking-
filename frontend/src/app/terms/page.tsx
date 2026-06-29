import Link from "next/link";
import type { Metadata } from "next";
import { siteConfig } from "@/lib/siteConfig";

export const metadata: Metadata = {
  title: "用户协议 — Speaking",
  description: "Speaking 用户协议",
};

const operatorName = siteConfig.companyName || "（个体工商户名称待补充）";
const uscc = siteConfig.companyUscc;

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-canvas px-4 py-12">
      <article className="container-page max-w-3xl">
        <h1 className="font-display text-3xl font-normal text-ink tracking-display-md">
          用户协议
        </h1>
        <p className="mt-2 text-sm text-muted">最后更新：2026 年 6 月 29 日</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-body">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-ink">一、服务性质</h2>
            <p>
              Speaking（以下简称"本站"）由 {operatorName}
              {uscc ? `（统一社会信用代码：${uscc}）` : ""}{" "}
              运营，是面向中文用户的英语口语学习工具。 本站为
              <strong>非经营性工具展示平台</strong>
              ，提供视频字幕、口语评测、词汇学习等功能展示与使用，
              <strong>不涉及任何资金收付</strong>。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-ink">二、会员与付费</h2>
            <p>
              本站不在站内提供在线支付功能。Pro
              会员服务通过第三方电商平台（微信小商店）购买，
              购买完成后用户凭借兑换码在本站激活会员权益。购买款项由第三方平台收取，
              本站不直接收取、保管或处置任何用户资金。
            </p>
            <p>
              退款、发票等事宜均依据购买所在第三方平台的规则处理，本站不承担资金侧责任。
              会员有效期以兑换码激活时写入的到期时间为准。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-ink">三、账号</h2>
            <p>
              用户应使用真实信息注册账号，妥善保管账号与密码。因账号保管不善造成的损失由用户自行承担。
              本站有权对违反法律法规或本协议的账号采取限制或封禁措施。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-ink">
              四、内容与知识产权
            </h2>
            <p>
              本站引用的视频内容来源自第三方平台，相关权利归原作者所有，本站仅用于学习演示。
              用户在本站产生的学习数据归用户本人所有。未经授权，不得复制、转载或商用本站的原创内容。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-ink">五、免责声明</h2>
            <p>
              本站提供的 AI
              评测、翻译、词汇标注等功能仅供参考学习，不构成专业语言评判。
              因网络、设备或第三方服务原因导致的功能中断，本站不承担责任。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-ink">六、协议变更</h2>
            <p>
              本站可根据法律法规及运营需要更新本协议，更新后将在本页面公示。继续使用即视为接受变更。
            </p>
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
