import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "学习记录 — SeeWord",
  description: "接着上次的视频继续学习。",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
