import { redirect } from "next/navigation";

export default function RetiredWeeklyReport() {
  redirect("/profile?tab=progress&retired=weekly-report");
}
