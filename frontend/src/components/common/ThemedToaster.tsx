"use client";

import { Toaster } from "sonner";
import { useThemeContext } from "@/components/common/ThemeProvider";

export function ThemedToaster() {
  const { theme } = useThemeContext();
  return <Toaster position="top-center" richColors theme={theme} />;
}
