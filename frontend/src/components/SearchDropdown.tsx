'use client';

import { useRouter } from 'next/navigation';
import { Loader2, FileSearch } from 'lucide-react';
import { VideoThumbnail } from '@/components/VideoThumbnail';

export interface SearchResultItem {
  id: string;
  title: string;
  platform: string;
  thumbnail_url: string | null;
  difficulty_level: string | null;
  duration: number | null;
  is_official: boolean;
}

interface SearchDropdownProps {
  results: SearchResultItem[];
  isLoading: boolean;
  query: string;
  onSelect: (videoId: string) => void;
  onClose: () => void;
}

function DifficultyBadge({ level }: { level: string | null }) {
  if (!level) return null;
  const colors: Record<string, string> = {
    A2: 'bg-green-100 text-green-700',
    B1: 'bg-blue-100 text-blue-700',
    B2: 'bg-amber-100 text-amber-700',
    C1: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded ${colors[level] || 'bg-gray-100 text-gray-600'}`}>
      {level}
    </span>
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  const labels: Record<string, string> = {
    youtube: 'YouTube',
    bilibili: 'Bilibili',
    douyin: 'Douyin',
    tiktok: 'TikTok',
    twitter: 'X',
    instagram: 'Instagram',
    local: 'Local',
    other: 'Other',
  };
  return (
    <span className="text-[10px] text-muted-soft">{labels[platform] || platform}</span>
  );
}

export function SearchDropdown({ results, isLoading, query, onSelect, onClose }: SearchDropdownProps) {
  const router = useRouter();

  function handleClick(videoId: string) {
    onSelect(videoId);
    router.push(`/watch/${videoId}`);
  }

  // Empty query — nothing to show
  if (!query.trim()) return null;

  // Loading state
  if (isLoading) {
    return (
      <div className="absolute top-full left-0 right-0 mt-1 bg-canvas border border-hairline rounded-md shadow-lg z-50 p-4 flex items-center justify-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-sm text-muted">搜索中...</span>
      </div>
    );
  }

  // No results
  if (results.length === 0) {
    return (
      <div className="absolute top-full left-0 right-0 mt-1 bg-canvas border border-hairline rounded-md shadow-lg z-50 p-6 flex flex-col items-center gap-2">
        <FileSearch className="h-8 w-8 text-muted-soft" />
        <span className="text-sm text-muted">没有找到相关视频</span>
      </div>
    );
  }

  return (
    <div className="absolute top-full left-0 right-0 mt-1 bg-canvas border border-hairline rounded-md shadow-lg z-50 max-h-[400px] overflow-y-auto">
      <ul className="py-1">
        {results.map((video) => (
          <li key={video.id}>
            <button
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-soft transition-colors text-left"
              onClick={() => handleClick(video.id)}
              onMouseDown={(e) => e.preventDefault()} // prevent blur on click
            >
              <div className="flex-shrink-0 w-20 h-12 rounded overflow-hidden">
                <VideoThumbnail
                  url={video.thumbnail_url}
                  title={video.title}
                  platform={video.platform}
                  duration={video.duration}
                  className="h-full w-full"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink line-clamp-1">{video.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <PlatformBadge platform={video.platform} />
                  <DifficultyBadge level={video.difficulty_level} />
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
