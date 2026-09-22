"use client";

import { useState } from "react";
import NextImage from "next/image";
import { cn } from "@/lib/utils";
import { avatarColor, defaultAvatarUrl, userInitial, type AvatarGender } from "@/lib/avatar";
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
 * New users without an upload get a line-drawn male/female default avatar, chosen by the
 * user's own gender. Until they fill that in it is derived from the same seed the gradient
 * uses (id, then name/phone) — deterministic, never random, and a provisional placeholder
 * rather than a decision made for them; the profile page lets them set their gender at any
 * time.
 *
 * `src === undefined` means the caller has not resolved the user's avatar yet — the JWT
 * does not carry `avatar_url`, so TopBar reads it from `profileStore`. That renders the
 * loading skeleton rather than a face, which for a user with an upload would be someone
 * else's. `src === null` means "known to have none" and gets the default illustration.
 *
 * Load failures are tracked against the URL that failed rather than as a sticky flag, so a
 * later good `src` (a fresh upload replacing a 404) renders without needing a remount.
 *
 * Watch-page aligned: `rounded-full` + `text-on-primary` over the gradient.
 */
export function Avatar({
  src,
  name,
  seed,
  gender,
  size = "md",
  className,
  alt,
}: {
  src?: string | null;
  /** Display name (or user object) — first char becomes the fallback initial. */
  name?: { name?: string | null; phone?: string | null } | string | null | undefined;
  /** Stable id for the deterministic colour and provisional default face. Defaults to name/phone. */
  seed?: string | null | undefined;
  /** The user's gender; null/undefined falls back to the seed. */
  gender?: AvatarGender | null;
  size?: AvatarSize;
  className?: string;
  alt?: string;
}) {
  const [failedUpload, setFailedUpload] = useState<string | null>(null);
  const [failedDefault, setFailedDefault] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);

  const initial = userInitial(name);
  const colorSeed = seed ?? (typeof name === "string" ? name : (name?.name ?? name?.phone ?? null));
  const color = avatarColor(colorSeed);

  // User uploads live behind the API (/media/...) and need mediaUrl(); the
  // default illustration is a static /public asset and must be used as-is.
  const uploadSrc = src ? mediaUrl(src) : null;
  const hasUpload = !!uploadSrc && failedUpload !== uploadSrc;
  const pending = src === undefined;
  const defaultSrc = defaultAvatarUrl(colorSeed, gender);
  const hasDefault = !pending && !hasUpload && failedDefault !== defaultSrc;
  const showImage = hasUpload || hasDefault;
  const resolvedSrc = hasUpload && uploadSrc ? uploadSrc : defaultSrc;
  const loaded = loadedSrc === resolvedSrc;

  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center rounded-full overflow-hidden font-semibold text-on-primary flex-shrink-0 select-none",
        !showImage && color,
        SIZE[size],
        className
      )}
    >
      {pending ? (
        <span className="absolute inset-0 animate-pulse bg-surface-card" aria-hidden />
      ) : showImage ? (
        <>
          {!loaded && (
            <span className="absolute inset-0 animate-pulse bg-surface-card" aria-hidden />
          )}
          <NextImage
            src={resolvedSrc}
            alt={alt ?? initial}
            fill
            sizes="40px"
            onError={() =>
              hasUpload ? setFailedUpload(resolvedSrc) : setFailedDefault(resolvedSrc)
            }
            onLoad={() => setLoadedSrc(resolvedSrc)}
            className={cn(
              "object-cover transition-opacity duration-200",
              // The default illustrations are line art on a flat cream ground, which
              // would sit as a bright disc on the dark theme; inverting them is what
              // makes them follow the theme (INV-017). Uploads are left as uploaded.
              hasDefault && "dark:invert",
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
