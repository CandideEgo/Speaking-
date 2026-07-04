import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "登录 — Speaking",
  description: "登录 Speaking，继续用真实视频学英语。",
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
