"use client";

import { useState, type ReactNode } from "react";
import NextImage from "next/image";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/api";

/**
 * Image primitive — replaces the 11 bare `<img>` tags (each carrying an
 * `eslint-disable @next/next/no-img-element`) with a `next/image` wrapper that:
 *  - routes `src` through `mediaUrl` (so CDN hosts hit the backend proxy and
 *    relative paths resolve against the API origin);
 *  - shows a pulse placeholder while loading and fades the image in on load;
 *  - falls back to `fallback` (or a neutral block) on missing src / load error
 *    — so a misconfigured `remotePatterns` entry degrades gracefully instead of
 *    showing a broken-image icon.
 *
 * Default mode is `fill`: the caller provides a `relative` + sized parent
 * (e.g. `relative aspect-video`, `h-12 w-20`) and `<Image>` renders the
 * `next/image` absolute-positioned inside it. Pass `width` + `height` (and
 * `fill={false}`) for fixed-size images with no sized parent.
 *
 * `fallback` is rendered as-is when `src` is empty or the image errors — for
 * `fill` mode, make it `absolute inset-0` (or `w-full h-full`) so it fills the
 * parent. `imgClassName` targets the `<img>` (e.g. `object-contain`).
 */
export function Image({
  src,
  alt,
  fill = true,
  width,
  height,
  className,
  imgClassName,
  fallback,
  sizes,
  loading = "lazy",
  ...props
}: {
  src?: string | null;
  alt: string;
  /** Render with `fill` (parent must be relative + sized). Default true. */
  fill?: boolean;
  width?: number;
  height?: number;
  /** Classes on the default fallback block (fill mode: applies to the absolute block). */
  className?: string;
  /** Classes on the `<img>` itself. */
  imgClassName?: string;
  /** Shown when src is empty or image fails. Defaults to a neutral block. */
  fallback?: ReactNode;
  sizes?: string;
  loading?: "eager" | "lazy";
} & Omit<
  React.ComponentPropsWithoutRef<typeof NextImage>,
  | "src"
  | "alt"
  | "fill"
  | "width"
  | "height"
  | "className"
  | "loading"
  | "onError"
  | "onLoad"
  | "sizes"
>) {
  const [errored, setErrored] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const transition = cn(
    "transition-opacity duration-300",
    loaded ? "opacity-100" : "opacity-0",
  );

  if (!src || errored) {
    if (fallback) return <>{fallback}</>;
    return (
      <div
        className={cn("bg-surface-card", fill ? "absolute inset-0" : className)}
        role="img"
        aria-label={alt}
      />
    );
  }

  if (!fill) {
    return (
      <NextImage
        src={mediaUrl(src)}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        loading={loading}
        onError={() => setErrored(true)}
        onLoad={() => setLoaded(true)}
        className={cn(transition, imgClassName)}
        {...props}
      />
    );
  }

  return (
    <>
      {!loaded && (
        <div
          className="absolute inset-0 animate-pulse bg-surface-card"
          aria-hidden
        />
      )}
      <NextImage
        src={mediaUrl(src)}
        alt={alt}
        fill
        sizes={sizes}
        loading={loading}
        onError={() => setErrored(true)}
        onLoad={() => setLoaded(true)}
        className={cn("object-cover", transition, imgClassName)}
        {...props}
      />
    </>
  );
}
