"use client";

import { useEffect, useState } from "react";

/**
 * 弹层（dialog / select / popover）的挂载点。
 *
 * 用户端把品牌变量收在 `.user-ui` 作用域里（蓝），管理端才是橙；
 * 挂到 `document.body` 会脱离作用域，弹层里的 `bg-action-primary` 会从蓝变橙。
 * 管理端没有 `.user-ui`，回落到 body。
 *
 * 首帧返回 null（SSR 与 hydration 一致），挂载后再定位容器。
 */
export function useOverlayContainer(): HTMLElement | null {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setContainer(document.querySelector<HTMLElement>(".user-ui") ?? document.body);
  }, []);

  return container;
}
