import type { Metadata } from "next";
import { siteConfig } from "@/lib/siteConfig";
import { LegalLayout, type LegalSection } from "@/components/legal/LegalLayout";
import { LegalTable } from "@/components/legal/LegalTable";

export const metadata: Metadata = {
  robots: { index: true, follow: true },
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

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-title font-semibold text-ink">{children}</h2>;
}

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="隐私政策"
      updatedAt="2026 年 10 月 19 日"
      sections={SECTIONS}
      siblingHref="/terms"
      siblingLabel="查看用户协议"
    >
      <section id="sec-1" className="scroll-mt-10 space-y-3">
        <H2>一、政策适用</H2>
        <p>
          本政策适用于 {operatorName}
          {uscc ? `（统一社会信用代码：${uscc}）` : ""} 运营的 SeeWord（以下简称“本站”）。
          本站提供英语学习服务，重视用户隐私保护。
        </p>
      </section>

      <section id="sec-2" className="scroll-mt-10 space-y-3">
        <H2>二、收集的信息</H2>
        <p>在您使用本站时，我们按「功能必需」原则收集以下信息：</p>
        <LegalTable
          caption="收集范围与「不提供会怎样」"
          columns={["信息类别", "具体内容", "用途", "不提供会怎样"]}
          rows={[
            [
              "账号信息",
              "手机号、昵称（可选）、加密后的密码、账号创建时间",
              "注册、登录、找回密码、账号安全",
              "无法注册或登录，只能浏览公开内容",
            ],
            [
              "学习数据",
              "观看记录与进度、单词训练与词库、收藏与笔记、练习记录、学习偏好（目标考试、每日目标）",
              "同步进度、生成复习排期、展示基础学习统计",
              "换设备或重新登录后无法接着上次继续，统计为空",
            ],
            [
              "设备与日志",
              "访问时间、浏览器类型与版本、操作系统、IP 地址、错误码",
              "运行维护、故障排查、安全防护与限流",
              "不影响主要功能；缺少日志会降低问题定位效率",
            ],
            [
              "历史跟读录音",
              "功能下线前你主动保存的音频",
              "保留历史数据供账号导出与注销清理",
              "已停止录音与上传；保留历史文件，不新增录音",
            ],
            [
              "会员订单",
              "关联账号的购买标识、订单及付款状态",
              "确认付款并开通会员",
              "不能购买会员；不影响已有免费权益",
            ],
          ]}
        />
        <p>
          为保持登录状态，本站会在浏览器中写入登录凭据（cookie）与本地存储的登录令牌；
          它们只用于身份校验，不用于追踪站外行为。
        </p>
      </section>

      <section id="sec-3" className="scroll-mt-10 space-y-3">
        <H2>三、信息用途</H2>
        <p>
          收集的信息仅用于提供学习功能（视频播放与进度、逐词点读与词卡、词库与间隔复习、
          练习与成绩回看、基础学习统计）、改进服务质量与保障账号安全，不出售给任何第三方。
        </p>
      </section>

      <section id="sec-4" className="scroll-mt-10 space-y-3">
        <H2>四、第三方服务</H2>
        <p>
          为提供翻译、字幕转写、AI 词汇注释等功能，本站会向下列类别的第三方服务传输
          完成该功能所必需的最小范围数据：
        </p>
        <LegalTable
          caption="第三方服务类别与传输范围"
          columns={["服务类别", "传输的数据", "目的"]}
          rows={[
            ["短信服务商", "手机号、验证码发送记录", "下发注册、登录与找回密码的短信验证码"],
            ["语音识别服务", "视频音轨（不含你的个人信息）", "生成字幕与逐词时间戳"],
            ["翻译与 AI 注释服务", "字幕文本（不含你的个人信息）", "生成中文翻译与词汇注释"],
            ["对象存储与内容分发", "视频、封面与播放请求的必要参数", "存储与分发视频资源"],
            [
              "金数据及支付服务",
              "购买标识、所选档位及完成付款所需的信息",
              "收款、核对订单并开通至当前账号",
            ],
          ]}
        />
        <p>
          视频内容来源自第三方平台，其页面上的播放与跳转行为受该平台自身的隐私政策约束，
          本站不对其数据处理行为承担责任。本站不向任何第三方出售、出租个人信息。
        </p>
      </section>

      <section id="sec-5" className="scroll-mt-10 space-y-3">
        <H2>五、数据存储与安全</H2>
        <p>
          我们采取合理的技术与管理措施保护您的信息（全站 HTTPS、登录令牌有效期、
          密码加盐哈希、最小权限与访问留痕），但互联网传输不存在绝对安全，
          我们无法保证百分之百安全。若发生个人信息泄露、篡改或丢失，
          我们会按法律要求及时向您告知事件情况、可能影响与已采取的处置措施。
        </p>
      </section>

      <section id="sec-6" className="scroll-mt-10 space-y-3">
        <H2>六、您的权利</H2>
        <p>
          您有权访问、更正或删除自己的账号与学习数据，也可以撤回通知同意、申请导出数据或注销账号。
          如需行使上述权利，可通过站内「帮助与反馈」或本页公示的联系方式提出； 我们会在 15
          个工作日内处理，导出类请求在数据量较大时可能延长至 30 天并提前告知进度。
        </p>
      </section>

      <section id="sec-7" className="scroll-mt-10 space-y-3">
        <H2>七、政策更新</H2>
        <p>
          本政策可能随功能调整或法规变化更新，更新后将在本页面公示并标注更新日期；
          涉及重大权益的变更会以站内通知等方式显著提示。
        </p>
      </section>
    </LegalLayout>
  );
}
