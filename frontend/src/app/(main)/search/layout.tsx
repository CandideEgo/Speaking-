import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "搜索 — SeeWord",
  description: "查找视频、字幕、词汇与频道。",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
