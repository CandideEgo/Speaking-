import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "每日练习 — SeeWord",
  description: "开始一组适合你的阅读练习。",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
