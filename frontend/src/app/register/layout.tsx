import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "注册 — Speaking",
  description: "创建 Speaking 账号，开始用真实视频练习英语口语。",
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
