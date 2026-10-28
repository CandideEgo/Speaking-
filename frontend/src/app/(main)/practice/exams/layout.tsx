import type { Metadata } from "next";
import { Suspense } from "react";
import { FullPageSpinner } from "@/components/common/Spinner";

export const metadata: Metadata = {
  title: "真题练习 — SeeWord",
  description: "选择试卷，巩固阅读与词汇。",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<FullPageSpinner />}>{children}</Suspense>;
}
