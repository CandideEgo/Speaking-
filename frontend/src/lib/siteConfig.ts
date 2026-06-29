/**
 * 站点级合规与运营配置（构建时注入，前端可见）。
 *
 * 这些值通过 NEXT_PUBLIC_* 环境变量在构建期注入，用于 ICP 合规公示与
 * "微信小商店购买"跳转。未配置时为空字符串，前端按"备案/开店中"占位渲染。
 *
 * 个体户无 ICP 经营许可证，网站为非经营性工具展示平台，不在站内收款；
 * 会员通过微信小商店购买后用兑换码激活。取得备案/开店后填入以下变量。
 */
export const siteConfig = {
  /** 微信小商店商品/店铺链接，未开店时留空。 */
  miniStoreUrl: process.env.NEXT_PUBLIC_MINI_STORE_URL || "",
  /** 个体工商户名称。 */
  companyName: process.env.NEXT_PUBLIC_COMPANY_NAME || "",
  /** 统一社会信用代码。 */
  companyUscc: process.env.NEXT_PUBLIC_COMPANY_USCC || "",
  /** ICP 备案号，如"京ICP备2025000001号"。 */
  icpBeian: process.env.NEXT_PUBLIC_ICP_BEIAN || "",
  /** 公安网安备案号，如"京公网安备11000000000001号"。 */
  policeBeian: process.env.NEXT_PUBLIC_POLICE_BEIAN || "",
} as const;

/** 是否已有任意备案/主体信息可公示。 */
export const hasComplianceInfo = Boolean(
  siteConfig.companyName || siteConfig.icpBeian || siteConfig.policeBeian,
);
