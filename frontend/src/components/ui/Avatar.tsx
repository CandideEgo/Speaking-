"use client";

import { useState } from "react";
import NextImage from "next/image";
import { cn } from "@/lib/utils";
import { avatarColor, userInitial } from "@/lib/avatar";
import { mediaUrl } from "@/lib/api";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE: Record<AvatarSize, string> = {
  xs: "w-6 h-6 text-[10px]",
  sm: "w-7 h-7 text-[11px]",
  md: "w-8 h-8 text-xs",
  lg: "w-10 h-10 text-sm",
  xl: "w-16 h-16 text-lg",
};

/**
 * Avatar primitive — consolidates the `avatar_url ? <img> : <initial+gradient>`
 * pattern duplicated across TopBar / CommunityFeedWidget / community page /
 * ProfileTab / CommentThread. Renders the user's avatar image via `next/image`
 * (src routed through `mediaUrl`); falls back to a deterministic gradient +
 * first initial on missing src or load error. Color seed is usually the user
 * id; falls back to name/email so the same user always gets the same color.
 *
 * Watch-page aligned: `rounded-full` + `text-on-primary` over the gradient.
 */
export function Avatar({
  src,
  name,
  seed,
  size = "md",
  className,
  alt,
}: {
  src?: string | null;
  /** Display name (or user object) — first char becomes the fallback initial. */
  name?:
    | { name?: string | null; email?: string | null }
    | string
    | null
    | undefined;
  /** Stable id for deterministic color. Defaults to name/email. */
  seed?: string | null | undefined;
  size?: AvatarSize;
  className?: string;
  alt?: string;
}) {
  const [errored, setErrored] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const showImage = !!src && !errored;

  const initial = userInitial(name);
  const colorSeed =
    seed ??
    (typeof name === "string" ? name : (name?.name ?? name?.email ?? null));
  const color = avatarColor(colorSeed);

  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center rounded-full overflow-hidden font-semibold text-on-primary flex-shrink-0 select-none",
        !showImage && color,
        SIZE[size],
        className,
      )}
    >
      {showImage ? (
        <>
          {!loaded && (
            <span
              className="absolute inset-0 animate-pulse bg-surface-card"
              aria-hidden
            />
          )}
          <NextImage
            src={mediaUrl(src)}
            alt={alt ?? initial}
            fill
            sizes="40px"
            onError={() => setErrored(true)}
            onLoad={() => setLoaded(true)}
            className={cn(
              "object-cover transition-opacity duration-200",
              loaded ? "opacity-100" : "opacity-0",
            )}
          />
        </>
      ) : (
        initial
      )}
    </span>
  );
}
