import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "真题练习 — SeeWord",
  description: "选择试卷，巩固阅读与词汇。",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
