import { redirect } from "next/navigation";

/**
 * 内测期免费开放（需求 §2.3）：不引入 Pro 概念，结算页退役。
 * 支付本身早已因 ICP 合规停用（payment disabled），此处一并收口。
 */
export default function CheckoutPage() {
  redirect("/");
}
