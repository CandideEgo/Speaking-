import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "作者频道 — SeeWord",
  description: "发现英语视频频道。",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
