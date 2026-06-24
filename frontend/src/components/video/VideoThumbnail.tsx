"use client";

import { useState, useMemo, useEffect, useRef, memo } from "react";
import { Tv } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";

interface VideoThumbnailProps {
  url: string | null;
  title: string;
  platform?: "youtube" | "bilibili" | "douyin";
  duration?: number | null;
  className?: string;
  aspectClass?: string; // override aspect ratio, e.g. 'aspect-[9/16]'
  hoverOverlay?: React.ReactNode;
}

function gradientFromString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hues = [15, 30, 45, 200, 220, 260, 340];
  const h1 = hues[Math.abs(hash) % hues.length];
  const h2 = hues[(Math.abs(hash >> 3) + 3) % hues.length];
  return `linear-gradient(135deg, hsl(${h1}, 80%, 58%), hsl(${h2}, 75%, 48%))`;
}

function initialFromTitle(title: string): string {
  const char = title.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(char) ? char : "V";
}

export const VideoThumbnail = memo(function VideoThumbnail({
  url,
  title,
  duration,
  className,
  aspectClass,
  hoverOverlay,
}: VideoThumbnailProps) {
  const [status, setStatus] = useState<"loading" | "error" | "loaded">("loading");
  const imgRef = useRef<HTMLImageElement>(null);

  const showPlaceholder = !url || status === "error";
  const bgStyle = useMemo(() => gradientFromString(title), [title]);

  useEffect(() => {
    if (!url || status !== "loading") return;
    const timer = setTimeout(() => {
      if (imgRef.current && imgRef.current.naturalWidth === 0) {
        setStatus("error");
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [url, status]);

  const aspect = aspectClass || "aspect-video";

  return (
    <div className={cn("relative overflow-hidden bg-cream-soft", aspect, className)}>
      {url && status !== "error" && (
        <img
          ref={imgRef}
          src={url}
          alt={title}
          className={cn(
            "h-full w-full object-cover transition-opacity duration-300",
            status === "loaded" ? "opacity-100" : "opacity-0"
          )}
          loading="lazy"
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
        />
      )}

      {status === "loading" && url && (
        <div className="absolute inset-0 animate-pulse bg-cream-soft" />
      )}

      {showPlaceholder && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center text-ivory/95"
          style={{ background: bgStyle }}
        >
          <div className="flex flex-col items-center gap-1.5">
            <Tv size={28} className="opacity-90" strokeWidth={1.5} />
            <span className="text-3xl font-bold tracking-tight drop-shadow-sm">
              {initialFromTitle(title)}
            </span>
          </div>
        </div>
      )}

      {duration && duration > 0 && (
        <span className="absolute bottom-1.5 right-1.5 rounded-sm bg-ink/80 px-1.5 py-0.5 text-[11px] font-medium text-ivory">
          {formatDuration(duration)}
        </span>
      )}

      {hoverOverlay && (
        <div className="absolute inset-0 flex items-center justify-center bg-ink/0 transition-colors group-hover:bg-ink/20">
          {hoverOverlay}
        </div>
      )}
    </div>
  );
});
