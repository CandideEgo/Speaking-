import { redirect } from "next/navigation";

/**
 * 内测期免费开放（需求 §2.3）：不引入 Pro 概念，定价页退役 → 首页。
 */
export default function PricingPage() {
  redirect("/");
}
