import { redirect } from "next/navigation";

/**
 * 内测期免费开放（需求 §2.3）：不引入 Pro 概念，兑换码页退役。
 * 后端 `/redeem-codes/*` 与 RedeemCode 表保留 dormant（未来收费可复用）。
 */
export default function RedeemPage() {
  redirect("/");
}
