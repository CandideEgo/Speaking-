import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "登录 — Speaking",
  description: "登录 Speaking，继续你的英语口语练习之旅。",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
