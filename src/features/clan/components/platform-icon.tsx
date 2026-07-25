"use client";

import { useEffect, useRef, useState } from "react";
import type { IconType } from "react-icons";
import { FaPlaystation, FaXbox } from "react-icons/fa6";
import { SiEa } from "react-icons/si";

import type { Platform } from "@prisma/client";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { PLATFORM_LABEL } from "../lib/format";

// Real brand marks, in each platform's colour. Xbox and PlayStation come from
// the same Font Awesome set so their weight matches; EA has no Font Awesome
// glyph, so it uses the Simple Icons mark.
const PLATFORM_MARK: Record<Platform, { Icon: IconType; className: string }> = {
  ea: { Icon: SiEa, className: "text-zinc-100" },
  xbox: { Icon: FaXbox, className: "text-green-500" },
  psn: { Icon: FaPlaystation, className: "text-blue-400" },
};

const COPIED_FEEDBACK_MS = 1500;

interface PlatformIconProps {
  platform: Platform;
  /** The member's id on that platform: shown on hover, copied on click. */
  platformId?: string | null;
  className?: string;
}

export function PlatformIcon({
  platform,
  platformId,
  className,
}: PlatformIconProps) {
  const { Icon, className: accent } = PLATFORM_MARK[platform];
  const label = PLATFORM_LABEL[platform];

  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    if (!platformId || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(platformId);
    } catch {
      return; // Clipboard denied — say nothing rather than lie about copying.
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
  }

  const interactive = Boolean(platformId);

  return (
    // Forced open while the feedback shows: Radix closes a tooltip on click,
    // which would swallow the "Copiado!" confirmation.
    <Tooltip open={hovered || copied} onOpenChange={setHovered}>
      <TooltipTrigger asChild>
        <span
          // A <span> rather than a <button> because the member card wraps the
          // whole thing in a link, and a button inside an anchor is invalid.
          role={interactive ? "button" : "img"}
          tabIndex={interactive ? 0 : undefined}
          aria-label={
            interactive
              ? `Plataforma: ${label} · ${platformId}. Clique para copiar o id.`
              : `Plataforma: ${label}`
          }
          onClick={
            interactive
              ? (event) => {
                  // Stop the card's link from navigating.
                  event.preventDefault();
                  event.stopPropagation();
                  void copy();
                }
              : undefined
          }
          onKeyDown={
            interactive
              ? (event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  event.stopPropagation();
                  void copy();
                }
              : undefined
          }
          className={cn(
            "focus-visible:ring-ring inline-flex rounded focus-visible:ring-2 focus-visible:outline-none",
            interactive && "cursor-pointer",
          )}
        >
          <Icon className={cn("size-5 shrink-0", accent, className)} />
        </span>
      </TooltipTrigger>

      <TooltipContent>
        {copied ? (
          "Id copiado!"
        ) : (
          <>
            <span className="font-semibold">{label}</span>
            {platformId ? (
              <>
                {" · "}
                <span className="font-mono">{platformId}</span>
              </>
            ) : null}
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
