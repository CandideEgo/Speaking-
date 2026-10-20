import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "练习结果 — SeeWord",
  description: "查看答题结果与解析。",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
