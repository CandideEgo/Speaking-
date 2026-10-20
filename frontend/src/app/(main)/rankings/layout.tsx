import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "学习榜单 — SeeWord",
  description: "发现热门视频与学习动态。",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
