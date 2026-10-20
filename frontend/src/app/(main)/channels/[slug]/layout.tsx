import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "频道视频 — SeeWord",
  description: "浏览频道内容与订阅。",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
