import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "帮助与反馈 — SeeWord",
  description: "查找常见问题，联系 SeeWord 支持。",
  robots: { index: true, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
