'use client';

import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatViews } from '@/lib/format';

interface ShortItem {
  id: string;
  thumbnail_url: string;
  title: string;
  view_count: number | null;
}

interface ShortsRowProps {
  items: ShortItem[];
  onClick?: (item: ShortItem) => void;
}

export function ShortsRow({ items, onClick }: ShortsRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  function scroll(dir: 'left' | 'right') {
    if (!scrollRef.current) return;
    const scrollAmount = 300;
    scrollRef.current.scrollBy({
      left: dir === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  }

  if (!items.length) return null;

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center gap-1.5">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-red-600" fill="currentColor">
            <path d="M17.8 9.4c-.1-.3-.3-.5-.5-.6-.2-.2-.5-.3-.8-.3H7.5c-.3 0-.6.1-.8.3-.2.1-.4.3-.5.6-.1.3-.1.6 0 .9.1.3.3.5.5.6l4.5 2.6 4.5 2.6c.2.1.4.2.6.2.2 0 .4-.1.6-.2.2-.1.4-.3.5-.6.1-.3.1-.6 0-.9l-1.6-5.9z"/>
          </svg>
          <span className="text-lg font-bold text-[#0f0f0f]">Shorts</span>
        </div>
      </div>
      <div className="relative group">
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-white shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ChevronLeft size={16} />
        </button>
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto scrollbar-hide pb-2"
        >
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => onClick?.(item)}
              className="flex-shrink-0 w-[180px] cursor-pointer"
            >
              <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-gray-100">
                {item.thumbnail_url ? (
                  <img
                    src={item.thumbnail_url}
                    alt={item.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-full w-full bg-gray-200 flex items-center justify-center">
                    <span className="text-2xl font-bold text-gray-400">{item.title.charAt(0)}</span>
                  </div>
                )}
              </div>
              <p className="mt-2 text-sm font-medium text-[#0f0f0f] line-clamp-2 leading-snug">{item.title}</p>
              <p className="text-xs text-[#606060] mt-0.5">{formatViews(item.view_count)} views</p>
            </div>
          ))}
        </div>
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-white shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
