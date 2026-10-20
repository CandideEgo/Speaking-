import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "词汇过筛 — SeeWord",
  description: "选出需要学习的词汇。",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
