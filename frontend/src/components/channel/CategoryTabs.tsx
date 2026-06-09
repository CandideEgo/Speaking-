'use client';

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
  if (variant === 'pill') {
    return (
      <div className={cn('flex items-center gap-2 overflow-x-auto py-3 scrollbar-hide', bgClass)}>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={cn(
              'shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              activeId === cat.id
                ? 'bg-[#0f0f0f] text-white'
                : 'bg-[#f2f2f2] text-[#0f0f0f] hover:bg-[#e5e5e5]'
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
      <div className={cn('flex items-center gap-1 overflow-x-auto py-2 scrollbar-hide border-b', bgClass)}>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={cn(
              'shrink-0 px-4 py-2 text-sm font-medium transition-colors relative',
              activeId === cat.id
                ? 'text-[#00aeec]'
                : 'text-[#61666d] hover:text-[#00aeec]'
            )}
          >
            {cat.label}
            {activeId === cat.id && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#00aeec] rounded-full" />
            )}
          </button>
        ))}
      </div>
    );
  }

  // solid (douyin dark)
  return (
    <div className={cn('flex items-center gap-2 overflow-x-auto py-3 scrollbar-hide', bgClass)}>
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
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
