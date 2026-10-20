import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "视频学习 — SeeWord",
  description: "播放视频、点词查义与逐句跟读。",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
