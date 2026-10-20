import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SeeWord 会员 — SeeWord",
  description: "查看会员权益与价格。",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
