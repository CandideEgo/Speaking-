import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "我的账户 — SeeWord",
  description: "管理个人资料、学习进度与账户设置。",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
