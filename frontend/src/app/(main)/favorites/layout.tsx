import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "我的收藏 — SeeWord",
  description: "回顾收藏的视频与句子。",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
