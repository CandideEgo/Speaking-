"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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
  className?: string;
  /**
   * 触发按钮的可访问名（A-12）。行操作应传「<对象名> 的操作」。
   * 不传且用默认图标触发时兜底为「更多操作」；传了自定义 trigger 且不传
   * label 时保持原样（由 trigger 自带的文字提供名称）。
   */
  label?: string;
}

interface MenuPosition {
  top: number;
  left: number;
  maxHeight: number;
}

/** 菜单可视区留白与触发按钮间距（px）。 */
const EDGE_MARGIN = 8;
const TRIGGER_GAP = 4;
const MIN_MENU_HEIGHT = 96;

function menuItems(menu: HTMLDivElement | null): HTMLButtonElement[] {
  if (!menu) return [];
  return Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])'));
}

/**
 * Admin row-action dropdown.
 *
 * A11y（A-12）：触发按钮必须有可访问名（`label` 或默认「更多操作」），菜单为
 * `role="menu"`、条目 `role="menuitem"`；打开时焦点进入首项，↑/↓/Home/End 在
 * 条目间移动，Esc 关闭并把焦点还给触发按钮，Tab 关闭后按正常顺序继续。
 *
 * 裁切（A-22）：菜单走 portal 渲染到 body 并用 `position: fixed` 定位，按视口
 * 空间自动 flip（优先向下，放不下且上方更宽裕时向上）并 clamp 到视口内；
 * 超高时在菜单内部滚动。因此 `overflow-hidden`/`overflow-x-auto` 的表格容器
 * 不会再裁掉菜单。滚动/缩放时关闭菜单，避免 anchor 错位。
 */
export function AdminDropdown({
  items,
  trigger,
  align = "right",
  className,
  label,
}: AdminDropdownProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusFirstRef = useRef(false);
  const menuId = useId();
  const triggerId = useId();

  const closeMenu = useCallback((restoreFocus = false) => {
    setOpen(false);
    setPosition(null);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const openMenu = useCallback(() => {
    focusFirstRef.current = true;
    setOpen(true);
  }, []);

  // 点击菜单/触发按钮以外的区域关闭
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      closeMenu();
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open, closeMenu]);

  // 滚动/缩放时关闭（菜单内部滚动除外），避免 fixed 菜单与触发按钮脱位
  useEffect(() => {
    if (!open) return;
    function handleScroll(event: Event) {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      closeMenu();
    }
    function handleResize() {
      closeMenu();
    }
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [open, closeMenu]);

  // 第一遍渲染菜单（visibility:hidden）后量尺寸，算 flip/clamp 位置
  useEffect(() => {
    if (!open) return;
    const triggerEl = triggerRef.current;
    const menuEl = menuRef.current;
    if (!triggerEl || !menuEl) return;
    const triggerRect = triggerEl.getBoundingClientRect();
    const menuRect = menuEl.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - triggerRect.bottom - TRIGGER_GAP - EDGE_MARGIN;
    const spaceAbove = triggerRect.top - TRIGGER_GAP - EDGE_MARGIN;
    const flipUp = menuRect.height > spaceBelow && spaceAbove > spaceBelow;
    const maxHeight = Math.max(MIN_MENU_HEIGHT, flipUp ? spaceAbove : spaceBelow);
    const height = Math.min(menuRect.height, maxHeight);
    const top = Math.max(
      EDGE_MARGIN,
      flipUp ? triggerRect.top - TRIGGER_GAP - height : triggerRect.bottom + TRIGGER_GAP
    );
    const preferredLeft = align === "right" ? triggerRect.right - menuRect.width : triggerRect.left;
    const left = Math.max(
      EDGE_MARGIN,
      Math.min(preferredLeft, viewportWidth - menuRect.width - EDGE_MARGIN)
    );
    setPosition({ top, left, maxHeight });
  }, [open, align]);

  // 位置算好后把焦点移到第一个可用菜单项
  useEffect(() => {
    if (!open) {
      focusFirstRef.current = false;
      return;
    }
    if (!position || !focusFirstRef.current) return;
    focusFirstRef.current = false;
    (menuItems(menuRef.current)[0] ?? menuRef.current)?.focus({ preventScroll: true });
  }, [open, position]);

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if (event.key === "Tab") {
      // 交还触发按钮后让浏览器按正常 Tab 顺序继续
      closeMenu(true);
      return;
    }
    const elements = menuItems(menuRef.current);
    if (elements.length === 0) return;
    const currentIndex = elements.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex = -1;
    if (event.key === "ArrowDown") {
      nextIndex = currentIndex < 0 || currentIndex === elements.length - 1 ? 0 : currentIndex + 1;
    } else if (event.key === "ArrowUp") {
      nextIndex = currentIndex <= 0 ? elements.length - 1 : currentIndex - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = elements.length - 1;
    }
    if (nextIndex >= 0) {
      event.preventDefault();
      elements[nextIndex].focus({ preventScroll: true });
    }
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    if (open) {
      const elements = menuItems(menuRef.current);
      const target = event.key === "ArrowDown" ? elements[0] : elements[elements.length - 1];
      target?.focus({ preventScroll: true });
      return;
    }
    openMenu();
  }

  const triggerLabel = label ?? (trigger ? undefined : "更多操作");

  return (
    <div ref={rootRef} className={cn("relative inline-block", className)}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(e) => {
          e.stopPropagation();
          if (open) closeMenu(true);
          else openMenu();
        }}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors",
          "hover:bg-surface-soft hover:text-ink",
          open && "bg-surface-soft text-ink"
        )}
      >
        {trigger ?? <MoreHorizontal size={16} />}
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-labelledby={triggerId}
            tabIndex={-1}
            onKeyDown={handleMenuKeyDown}
            style={
              position
                ? { top: position.top, left: position.left, maxHeight: position.maxHeight }
                : { top: 0, left: 0, visibility: "hidden" }
            }
            className="fixed z-50 min-w-40 overflow-y-auto rounded-lg border border-hairline bg-canvas py-1 shadow-lg"
          >
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  disabled={item.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeMenu(true);
                    item.onClick();
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-copy transition-colors",
                    item.disabled
                      ? "cursor-not-allowed text-muted-soft"
                      : item.danger
                        ? "text-error hover:bg-error/10"
                        : "text-body hover:bg-surface-soft"
                  )}
                >
                  {Icon && <Icon size={15} aria-hidden />}
                  {item.label}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
