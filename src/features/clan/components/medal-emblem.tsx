import {
  Crosshair,
  Crown,
  Medal,
  Shield,
  Star,
  Swords,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";

import type { MedalTier } from "@prisma/client";
import { cn } from "@/lib/utils";

/**
 * Tier accents shared by the emblem and by the tier chips next to it, so the
 * catalog and the member profile always read as the same design language.
 */
export const TIER_ACCENT: Record<
  MedalTier,
  { surface: string; ring: string; icon: string; glow: string; chip: string }
> = {
  common: {
    surface: "from-zinc-200/30 via-zinc-400/18 to-zinc-700/40",
    ring: "border-zinc-300/60",
    icon: "text-zinc-100",
    glow: "shadow-zinc-900/60",
    chip: "border-zinc-400/40 bg-zinc-400/15 text-zinc-200",
  },
  rare: {
    surface: "from-sky-300/40 via-sky-500/25 to-sky-900/45",
    ring: "border-sky-300/75",
    icon: "text-sky-100",
    glow: "shadow-sky-950/60",
    chip: "border-sky-400/40 bg-sky-500/15 text-sky-200",
  },
  legendary: {
    surface: "from-yellow-300/40 via-amber-500/25 to-amber-800/40",
    ring: "border-yellow-400/80",
    icon: "text-yellow-200",
    glow: "shadow-yellow-900/60",
    chip: "border-yellow-500/40 bg-yellow-500/15 text-yellow-300",
  },
  special: {
    surface: "from-violet-300/40 via-fuchsia-500/25 to-violet-900/45",
    ring: "border-violet-300/80",
    icon: "text-violet-100",
    glow: "shadow-violet-900/70",
    chip: "border-violet-400/40 bg-violet-500/15 text-violet-200",
  },
};

const SIZES = {
  xs: { shell: "size-8 border", icon: "size-4", image: "32px" },
  sm: { shell: "size-11 border", icon: "size-5", image: "44px" },
  md: { shell: "size-16 border-2", icon: "size-7", image: "64px" },
  lg: { shell: "size-24 border-2", icon: "size-10", image: "96px" },
} as const;

// Curated map so we don't bundle the entire lucide set by name. Used until an
// admin uploads real artwork (Fase 2).
const ICONS: Record<string, LucideIcon> = {
  crosshair: Crosshair,
  shield: Shield,
  swords: Swords,
  crown: Crown,
  trophy: Trophy,
  star: Star,
};

interface MedalEmblemProps {
  name: string;
  tier: MedalTier;
  /** Uploaded artwork. Takes precedence over `icon`. */
  imageUrl?: string | null;
  /** Curated lucide icon name used while there is no artwork. */
  icon?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * A fully circular medal emblem. Renders the uploaded artwork when there is
 * one and falls back to a tier-tinted lucide icon otherwise.
 */
export function MedalEmblem({
  name,
  tier,
  imageUrl,
  icon,
  size = "md",
  className,
}: MedalEmblemProps) {
  const accent = TIER_ACCENT[tier];
  const dimensions = SIZES[size];
  const Icon = (icon && ICONS[icon]) || Medal;

  return (
    <span
      className={cn(
        "relative isolate inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br shadow-lg",
        dimensions.shell,
        accent.surface,
        accent.ring,
        accent.glow,
        className,
      )}
      title={name}
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={name}
          fill
          sizes={dimensions.image}
          className="rounded-full object-cover"
        />
      ) : (
        <Icon className={cn(dimensions.icon, accent.icon)} aria-hidden />
      )}

      {/* Glass sheen + inner rim, on top of the artwork. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/20 to-transparent"
      />
      {/* The inner rim only reads as detail at larger sizes; on xs it just
          muddies the icon. */}
      {size === "xs" ? null : (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-[3px] rounded-full border border-white/15"
        />
      )}
    </span>
  );
}
