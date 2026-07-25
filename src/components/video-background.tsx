"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

interface VideoBackgroundProps {
  /** Video file, muted and looping — decorative only. */
  src: string;
  /** First frame shown while the video buffers. Usually the static fallback. */
  poster: string;
  className?: string;
}

/**
 * Decorative looping video for section backgrounds.
 *
 * Deliberately mounts on the client only: users who ask for reduced motion
 * never download the file at all (the static image behind it stays visible),
 * and the video is kept out of the initial critical path. It fades in once it
 * can actually play, so there is no black flash over the poster.
 */
export function VideoBackground({
  src,
  poster,
  className,
}: VideoBackgroundProps) {
  const [allowMotion, setAllowMotion] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setAllowMotion(!query.matches);

    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  if (!allowMotion) return null;

  // Muted autoplay is always permitted, so the attribute is enough — no
  // imperative play() call. If a browser refuses anyway, the poster stays.
  return (
    <video
      src={src}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      disablePictureInPicture
      onCanPlay={() => setReady(true)}
      aria-hidden
      tabIndex={-1}
      className={cn(
        "absolute inset-0 h-full w-full object-cover transition-opacity duration-700",
        ready ? "opacity-100" : "opacity-0",
        className,
      )}
    />
  );
}
