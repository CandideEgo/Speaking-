import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "设置登录密码 — SeeWord",
  description: "为 SeeWord 账号设置手机号 + 密码登录方式，验证码登录继续可用。",
};

export default function SetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
