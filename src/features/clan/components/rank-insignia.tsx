"use client";

import Image from "next/image";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { insigniaPath, type Rank } from "@/lib/ranks";
import { cn } from "@/lib/utils";

// Height-based, width automatic: the artwork is vertical and its aspect ratio
// varies a lot between ranks (a Cabo chevron is nearly square, a Capitão bar is
// 1:2.5). Fixing the height keeps every insignia the same visual weight; fixing
// a square box would shrink the tall ones to a sliver.
const SIZES = {
  sm: { box: "h-10", px: 80 },
  md: { box: "h-12", px: 96 },
  lg: { box: "h-16", px: 128 },
} as const;

interface RankInsigniaProps {
  rank: Rank;
  size?: keyof typeof SIZES;
  /** Extra text appended to the tooltip, e.g. the points. */
  hint?: string;
  /**
   * Drops the tooltip and the label. Use when a parent already describes the
   * rank (the profile card wraps it in a HoverCard), so the two do not fight
   * over the same hover.
   */
  silent?: boolean;
  className?: string;
}

/**
 * A rank's insignia. The artwork lives in public/patentes/<slug>.webp — the files
 * there today are placeholders (a shield with the rank abbreviation) meant to be
 * overwritten by the real art under the same names.
 */
export function RankInsignia({
  rank,
  size = "md",
  hint,
  silent = false,
  className,
}: RankInsigniaProps) {
  const { box, px } = SIZES[size];
  const label = hint ? `${rank.name} · ${hint}` : rank.name;

  const artwork = (
    <Image
      src={insigniaPath(rank)}
      alt=""
      // The artwork is ~1920px wide; these are hints for the optimizer, while
      // the CSS below decides the real size. Without them a 500 KB source would
      // reach the browser untouched.
      width={px}
      height={px}
      className="h-full w-auto object-contain"
    />
  );

  if (silent) {
    return (
      <span className={cn("relative inline-flex w-auto shrink-0 items-center justify-center", box, className)}>
        {artwork}
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A <span> rather than a <button> because the member card wraps the
            whole thing in a link, and a button inside an anchor is invalid. */}
        <span
          role="img"
          aria-label={`Patente: ${label}`}
          className={cn("relative inline-flex w-auto shrink-0 items-center justify-center", box, className)}
        >
          {artwork}
        </span>
      </TooltipTrigger>

      <TooltipContent>
        <span className="font-heading font-semibold">{rank.name}</span>
        {hint ? (
          <>
            {" · "}
            <span className="font-mono tabular-nums">{hint}</span>
          </>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
