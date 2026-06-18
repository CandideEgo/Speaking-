'use client';

import { useRef } from 'react';
import { cn } from '@/lib/utils';

interface CategoryTabsProps {
  categories: { id: string; label: string }[];
  activeId: string;
  onSelect: (id: string) => void;
  variant?: 'pill' | 'underline' | 'solid';
  bgClass?: string;
}

export function CategoryTabs({
  categories,
  activeId,
  onSelect,
  variant = 'pill',
  bgClass = 'bg-transparent',
}: CategoryTabsProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(e: React.KeyboardEvent) {
    const currentIndex = categories.findIndex((c) => c.id === activeId);
    let nextIndex = currentIndex;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % categories.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + categories.length) % categories.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = categories.length - 1;
    } else {
      return;
    }

    onSelect(categories[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  }

  if (variant === 'pill') {
    return (
      <div className={cn('flex items-center gap-2 overflow-x-auto py-3 scrollbar-hide', bgClass)} role="tablist" aria-label="分类" onKeyDown={handleKeyDown}>
        {categories.map((cat, i) => (
          <button
            key={cat.id}
            ref={(el) => { tabRefs.current[i] = el; }}
            onClick={() => onSelect(cat.id)}
            role="tab"
            aria-selected={activeId === cat.id}
            tabIndex={activeId === cat.id ? 0 : -1}
            className={cn(
              'shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              activeId === cat.id
                ? 'bg-ink text-on-primary'
                : 'bg-surface-soft text-ink hover:bg-surface-cream-strong'
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>
    );
  }

  if (variant === 'underline') {
    return (
      <div className={cn('flex items-center gap-1 overflow-x-auto py-2 scrollbar-hide border-b', bgClass)} role="tablist" aria-label="分类" onKeyDown={handleKeyDown}>
        {categories.map((cat, i) => (
          <button
            key={cat.id}
            ref={(el) => { tabRefs.current[i] = el; }}
            onClick={() => onSelect(cat.id)}
            role="tab"
            aria-selected={activeId === cat.id}
            tabIndex={activeId === cat.id ? 0 : -1}
            className={cn(
              'shrink-0 px-4 py-2 text-sm font-medium transition-colors relative',
              activeId === cat.id
                ? 'text-platform-bilibili'
                : 'text-muted hover:text-platform-bilibili'
            )}
          >
            {cat.label}
            {activeId === cat.id && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-platform-bilibili rounded-full" />
            )}
          </button>
        ))}
      </div>
    );
  }

  // solid (douyin dark)
  return (
    <div className={cn('flex items-center gap-2 overflow-x-auto py-3 scrollbar-hide', bgClass)} role="tablist" aria-label="分类" onKeyDown={handleKeyDown}>
      {categories.map((cat, i) => (
        <button
          key={cat.id}
          ref={(el) => { tabRefs.current[i] = el; }}
          onClick={() => onSelect(cat.id)}
          role="tab"
          aria-selected={activeId === cat.id}
          tabIndex={activeId === cat.id ? 0 : -1}
          className={cn(
            'shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            activeId === cat.id
              ? 'bg-white text-black'
              : 'bg-transparent text-gray-400 hover:text-white'
          )}
        >
          {cat.label}
        </button>
      ))}
    </div>
  );
}
