import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "我的词单 — SeeWord",
  description: "管理并学习主题词单。",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
