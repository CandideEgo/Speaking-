import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "找回密码 — SeeWord",
  description: "用注册手机号与短信验证码重置 SeeWord 登录密码。",
};

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
