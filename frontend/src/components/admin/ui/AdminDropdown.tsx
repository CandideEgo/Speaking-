"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOverlayContainer } from "@/hooks/useOverlayContainer";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuPopup,
  DropdownMenuPortal,
  DropdownMenuPositioner,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";

export interface AdminDropdownItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export interface AdminDropdownProps {
  items: AdminDropdownItem[];
  /** 自定义触发内容；不传则渲染「…」图标按钮。 */
  trigger?: ReactNode;
  align?: "left" | "right";
  /** 作用在触发按钮上（2026-11 换 Base UI Menu 后不再有包裹 div）。 */
  className?: string;
  /**
   * 触发按钮的可访问名（A-12）。行操作应传「<对象名> 的操作」。
   * 不传且用默认图标触发时兜底为「更多操作」；传了自定义 trigger 且不传
   * label 时保持原样（由 trigger 自带的文字提供名称）。
   */
  label?: string;
  /**
   * 菜单打开时把触发按钮写进这个 ref，供随后弹出的对话框当「关闭后焦点去处」。
   *
   * 为什么需要：条目动作常常打开确认对话框，而对话框记的「打开前有焦点的
   * 元素」是菜单条目——它随后就被移除了，回焦只能落到 body。把触发器交给
   * 对话框，焦点才能回到用户原处（`AdminDialog` 的 `returnFocusRef`）。
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Admin row-action dropdown。
 *
 * 实现已换成 [`ui/DropdownMenu`](../../ui/DropdownMenu.tsx)（Base UI Menu）：
 * 键盘打开后首项即高亮、↑/↓/Home/End/typeahead 在条目间移动、Esc 关闭并把
 * 焦点还给触发按钮、Tab 移出即关闭、外部点击关闭，全部由原语负责。
 * **Tab 不再被拦截**——旧实现把 Tab 也吃掉再手动还原焦点，原语交给浏览器
 * 按正常顺序继续。
 *
 * 两处与旧实现的差异，都是有意的：
 * - 鼠标点开时焦点留在触发按钮上（条目靠 hover 高亮），不再强行把焦点塞进
 *   菜单；键盘打开才移动高亮与焦点。
 * - 禁用条目仍然是可聚焦的 `aria-disabled` 条目（读屏能读到「有这个动作，
 *   但现在不可用」），点击与回车都不会触发 `onClick`。
 *
 * Portal 到 body 后由原语做碰撞翻转 / 位移与超高内部滚动，所以
 * `overflow-hidden` / `overflow-x-auto` 的表格容器不会再裁掉菜单（A-22）；
 * 页面滚动时菜单自动跟随锚点，不再需要「滚动即关闭」。
 */
export function AdminDropdown({
  items,
  trigger,
  align = "right",
  className,
  label,
  returnFocusRef,
}: AdminDropdownProps) {
  const container = useOverlayContainer();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const triggerLabel = label ?? (trigger ? undefined : "更多操作");

  return (
    <DropdownMenu
      onOpenChange={(nextOpen) => {
        if (nextOpen && returnFocusRef) returnFocusRef.current = triggerRef.current;
      }}
    >
      <DropdownMenuTrigger
        ref={triggerRef}
        aria-label={triggerLabel}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors",
          "hover:bg-surface-soft hover:text-ink",
          "data-popup-open:bg-surface-soft data-popup-open:text-ink",
          className
        )}
      >
        {trigger ?? <MoreHorizontal size={16} />}
      </DropdownMenuTrigger>

      <DropdownMenuPortal container={container}>
        <DropdownMenuPositioner
          side="bottom"
          align={align === "right" ? "end" : "start"}
          sideOffset={4}
        >
          {/*
            回焦条件：条目动作常常会打开确认对话框。对话框打开后整页被置为
            `aria-hidden`/`inert`，此时原语把焦点还给触发器只会落到 body 上
            （实测见方案文档 §14），所以让对话框自己保持焦点。
          */}
          <DropdownMenuPopup
            finalFocus={() => {
              const el = triggerRef.current;
              if (!el) return false;
              return el.closest('[inert], [aria-hidden="true"]') ? false : true;
            }}
          >
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <DropdownMenuItem
                  key={item.key}
                  disabled={item.disabled}
                  onClick={item.onClick}
                  className={cn(
                    item.disabled
                      ? "cursor-not-allowed text-muted-soft"
                      : item.danger
                        ? "text-error data-highlighted:bg-error/10"
                        : "text-body"
                  )}
                >
                  {Icon && <Icon size={15} aria-hidden />}
                  {item.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuPopup>
        </DropdownMenuPositioner>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
}
