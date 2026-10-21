import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "视频学习 — SeeWord",
  description: "播放视频、点词查义与原句重听。",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
