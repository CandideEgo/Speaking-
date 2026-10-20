import { redirect } from "next/navigation";

/**
 * 定价页并入会员购买页（/upgrade）。
 * 公测起会员在站内登录后购买，购买链接带签名标识，付款后自动开通。
 */
export default function PricingPage() {
  redirect("/upgrade");
}
