import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "词汇训练 — SeeWord",
  description: "结合原句巩固记忆。",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
