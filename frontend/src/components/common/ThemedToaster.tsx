"use client";

import { Toaster } from "sonner";
import { useThemeContext } from "@/components/common/ThemeProvider";

export function ThemedToaster() {
  const { theme } = useThemeContext();
  // Phase 2：位置与时长统一在这里，页面不再各自传 duration。
  // offset 72 = 顶栏 56px + 16px 间距；top-center 落在顶栏下方，不压导航。
  return (
    <Toaster
      position="top-center"
      richColors
      theme={theme}
      duration={3000}
      offset={72}
      mobileOffset={72}
    />
  );
}
