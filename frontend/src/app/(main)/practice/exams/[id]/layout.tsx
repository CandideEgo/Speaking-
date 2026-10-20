import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "答题练习 — SeeWord",
  description: "阅读文章，完成本次练习。",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
