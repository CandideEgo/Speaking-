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
 * Avatar primitive — consolidates the `avatar_url ? <img> : <default-illustration>`
 * pattern duplicated across TopBar / ProfileTab. Renders the user's avatar image via `next/image`
 * (user uploads routed through `mediaUrl`; defaults served straight from /public); falls back
 * to a deterministic gradient + first initial only if even the default illustration fails to
 * load. Color seed is usually the user id; falls back to name/email so the same user always
 * gets the same color.
 *
 * New users without an upload get a line-drawn male/female default avatar chosen
 * deterministically from their stable id, so the same user always sees the same face.
 *
 * Watch-page aligned: `rounded-full` + `text-on-primary` over the gradient.
 */

/** Static default illustrations in /public — no mediaUrl() prefix needed. */
const DEFAULT_AVATAR_MALE = "/default-avatar-male.png";
const DEFAULT_AVATAR_FEMALE = "/default-avatar-female.png";

function pickDefaultAvatar(seed?: string | null): string {
  const s = seed ?? "";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h & 1) === 0 ? DEFAULT_AVATAR_MALE : DEFAULT_AVATAR_FEMALE;
}

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
  name?: { name?: string | null; phone?: string | null } | string | null | undefined;
  /** Stable id for deterministic color. Defaults to name/phone. */
  seed?: string | null | undefined;
  size?: AvatarSize;
  className?: string;
  alt?: string;
}) {
  const [errored, setErrored] = useState(false);
  const [defaultErrored, setDefaultErrored] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const initial = userInitial(name);
  const colorSeed = seed ?? (typeof name === "string" ? name : (name?.name ?? name?.phone ?? null));
  const color = avatarColor(colorSeed);

  // User uploads live behind the API (/media/...) and need mediaUrl(); the
  // default illustration is a static /public asset and must be used as-is.
  const hasUserAvatar = !!src && !errored;
  const showImage = hasUserAvatar || !defaultErrored;
  const resolvedSrc = hasUserAvatar ? mediaUrl(src) : pickDefaultAvatar(colorSeed);

  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center rounded-full overflow-hidden font-semibold text-on-primary flex-shrink-0 select-none",
        !showImage && color,
        SIZE[size],
        className
      )}
    >
      {showImage ? (
        <>
          {!loaded && (
            <span className="absolute inset-0 animate-pulse bg-surface-card" aria-hidden />
          )}
          <NextImage
            src={resolvedSrc}
            alt={alt ?? initial}
            fill
            sizes="40px"
            onError={() => {
              if (hasUserAvatar) setErrored(true);
              else setDefaultErrored(true);
            }}
            onLoad={() => setLoaded(true)}
            className={cn(
              "object-cover transition-opacity duration-200",
              loaded ? "opacity-100" : "opacity-0"
            )}
          />
        </>
      ) : (
        initial
      )}
    </span>
  );
}
