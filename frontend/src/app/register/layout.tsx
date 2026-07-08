import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "注册 — SeeWord",
  description: "创建 SeeWord 账号，开始用真实视频学英语。",
};

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
