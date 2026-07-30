import { Crosshair, Flag, Map as MapIcon, Medal, type LucideIcon } from "lucide-react";
import Image from "next/image";

import { cn } from "@/lib/utils";

import { formatHours, formatNumber, formatPercent } from "../lib/format";
import type { ProfileTopItem } from "../lib/queries";

export type GameProfileSummary = {
  /** In-game rank, as the game words it ("Second Lieutenant V"). */
  rankName: string | null;
  /** Numeric level behind it (141). */
  rankLevel: number | null;
  /** Insignia EA serves, on their CDN. */
  rankImageUrl: string | null;
};

interface GameProfilePanelProps {
  game: GameProfileSummary;
  /** Best weapon, most-played mode and most-played map. At most one of each. */
  topItems: ProfileTopItem[];
  className?: string;
}

/**
 * One card, normalised.
 *
 * EVERY CARD HAS THE SAME SLOTS, and that is the design decision rather than a
 * convenience: four cards describing four different things look like a spec sheet
 * only if the eye finds the same information in the same place on each. So the rank
 * and the map both fill `eyebrow / title / subtitle / value`, even though one is a
 * military rank and the other is a piece of terrain.
 */
type PanelCard = {
  key: string;
  /** What this card IS ("Melhor arma"). Read before the value, see below. */
  eyebrow: string;
  /** The name that answers it ("L110"). */
  title: string;
  /** Optional third line, for the secondary metric. */
  subtitle?: string;
  /** The headline figure, right-aligned. */
  value?: string;
  /** Its unit, under it. */
  valueLabel?: string;
  /** Artwork, already normalised into the frame. */
  art: React.ReactNode;
  /** Tailwind text colour for the eyebrow, from the palette PlayerStats uses. */
  accent: string;
};

const KIND_META: Record<
  ProfileTopItem["kind"],
  { eyebrow: string; icon: LucideIcon; accent: string; fit: ArtFit }
> = {
  weapon: { eyebrow: "Melhor arma", icon: Crosshair, accent: "text-red-400", fit: "contain" },
  gamemode: { eyebrow: "Modo mais jogado", icon: Flag, accent: "text-primary", fit: "contain" },
  // A photograph, so it fills the frame. See ArtFit.
  map: { eyebrow: "Mapa mais jogado", icon: MapIcon, accent: "text-teal-400", fit: "cover" },
};

const KIND_ORDER: ProfileTopItem["kind"][] = ["weapon", "gamemode", "map"];

/** Hours out of seconds, reusing the formatter the stat tiles use. */
function hoursFromSeconds(seconds: number): string {
  return formatHours(Math.round(seconds / 60));
}

/**
 * Artwork in a fixed frame.
 *
 * The frame is what makes the column look deliberate. The four images are wildly
 * different objects — a rank badge with its own padding, a weapon render on
 * transparency, a photographic map thumbnail, and for a mode no image at all — so
 * dropping them in raw gives four different visual weights in a stack of four rows.
 * A constant box with `object-contain` and a faint ring normalises all of it, and the
 * icon fallback lands in the same box rather than floating.
 */
function ArtFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background/50 ring-border/60 group-hover:ring-muted-foreground/30 flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md ring-1 transition-colors">
      {children}
    </div>
  );
}

/**
 * How an image sits in the frame, and it differs by what the image IS.
 *
 * `contain` for the rank insignia and the weapon: both are renders on transparency
 * that carry their own padding, so filling the frame would crop a badge's edges and
 * stretch a rifle. `cover` for the map, which is a photograph — a landscape inset
 * inside a 40px box reads as a thumbnail of nothing, while filling the frame makes it
 * a place.
 */
type ArtFit = "contain" | "cover";

function artFor(
  imageUrl: string | null,
  Icon: LucideIcon,
  accent: string,
  fit: ArtFit = "contain",
): React.ReactNode {
  return (
    <ArtFrame>
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          width={40}
          height={40}
          className={
            fit === "cover"
              ? // Edge to edge; the frame's `overflow-hidden` does the rounding.
                "size-full object-cover"
              : "size-8 object-contain"
          }
          // EA's assets are already sized for this, so the optimizer would only add a
          // hop through our own server for a few KB.
          unoptimized
        />
      ) : (
        // No artwork: a mode, whose art is SVG and is dropped at collection time
        // (serving third-party SVG through next/image needs `dangerouslyAllowSVG`).
        <Icon aria-hidden className={cn("size-4", accent)} />
      )}
    </ArtFrame>
  );
}

/** Builds the card for one top item, choosing figures by what the kind measures. */
function cardFor(item: ProfileTopItem): PanelCard {
  const { eyebrow, icon, accent, fit } = KIND_META[item.kind];
  const base = {
    key: item.kind,
    eyebrow,
    title: item.name,
    art: artFor(item.imageUrl, icon, accent, fit),
    accent,
  };

  // A weapon is a tool, so it reports kills and accuracy. A map and a mode are
  // places, so they report time and how often the member wins there. Nothing shows a
  // figure the source does not publish for that kind.
  if (item.kind === "weapon") {
    return {
      ...base,
      subtitle:
        item.accuracy === null
          ? undefined
          : `${item.accuracy.toFixed(1).replace(".", ",")}% de precisão`,
      value: formatNumber(item.kills),
      valueLabel: "kills",
    };
  }

  return {
    ...base,
    // Win rate only when there are matches to divide by, so a member with time logged
    // and no completed round never shows "NaN%" or a plausible-looking 0 %.
    subtitle:
      item.matches > 0 ? `${formatPercent(item.wins / item.matches)} de vitórias` : undefined,
    value: hoursFromSeconds(item.secondsUsed),
    valueLabel: "jogadas",
  };
}

/**
 * The member's standing IN THE GAME: the LEFT column of the stats section.
 *
 * A column of its own rather than a card in the header (clan owner, 2026-07-29): the
 * header keeps the CLAN rank, which is the ladder the clan competes on, and the game's
 * own progression lives here. Up to four cards: the level, the best weapon, the
 * most-played mode and the most-played map. The width cap lives on the grid column in
 * the page, not here, so this works at whatever width it is given.
 *
 * THE CARDS SHARE THE COLUMN'S HEIGHT EQUALLY (clan owner, 2026-07-29), which is why
 * this is a flex column with `flex-1` on each card and not `grid-rows-4`: the row
 * count varies from one to four while the collector fills in, and fixed rows would
 * leave holes for a member who only has some of it.
 *
 * ONE OF EACH, not a top three. Which is also why the order is fixed rather than
 * sorted: the cards answer different questions, so ranking them against each other
 * would mean nothing.
 *
 * WHY THE LABEL SITS ABOVE THE VALUE HERE, and below it in `PlayerStats`. Those tiles
 * hold numbers, and a number is self-describing enough to lead. These hold NAMES, and
 * "L110" means nothing until you know it is a weapon — so the category comes first and
 * the eye never has to backtrack. The rest of the visual language (surface, radius,
 * ring, accent colours, mono figures) is shared on purpose, so the two columns still
 * read as one system.
 *
 * Renders nothing at all when there is neither a rank nor an item. That is the normal
 * state for part of the roster, not an edge case: the profile pass reads 10 members
 * per cycle. A heading over an empty card would announce a hole that fills itself.
 */
export function GameProfilePanel({ game, topItems, className }: GameProfilePanelProps) {
  const byKind = new Map(topItems.map((item) => [item.kind, item]));
  const cards: PanelCard[] = [];

  if (game.rankName) {
    cards.push({
      key: "rank",
      eyebrow: "Battlefield 6",
      // The rank NAME is the identity and the level is the figure, not the other way
      // round: "Second Lieutenant V" is what the member calls themselves.
      title: game.rankName,
      value: game.rankLevel === null ? undefined : String(game.rankLevel),
      valueLabel: game.rankLevel === null ? undefined : "nível",
      art: artFor(game.rankImageUrl, Medal, "text-amber-400"),
      accent: "text-amber-400",
    });
  }

  for (const kind of KIND_ORDER) {
    const item = byKind.get(kind);
    if (item) cards.push(cardFor(item));
  }

  if (cards.length === 0) return null;

  return (
    <div className={cn("flex h-full flex-col gap-2", className)}>
      {cards.map((card) => (
        <Card key={card.key} card={card} />
      ))}
    </div>
  );
}

/** One card, so the four of them cannot drift apart. */
function Card({ card }: { card: PanelCard }) {
  return (
    <div
      className={cn(
        // `flex-1` is what splits the column height evenly; `min-h` keeps the cards
        // readable when the neighbouring grid is shorter than four cards need.
        "bg-secondary/80 flex min-h-16 flex-1 items-center gap-3 rounded-lg border px-3 py-2.5 backdrop-blur-sm",
        // HOVER THAT DOES NOT PROMISE A CLICK. The card is not interactive, so the
        // effect is colour only: the surface and both borders brighten one step, and
        // the art frame's ring moves with them (`group`), so the card responds as one
        // object. Deliberately no cursor change, no lift, no scale and no shadow —
        // every one of those reads as "clickable" and there is nothing to click.
        // `muted-foreground/30` is the same step the bio's dashed border uses.
        "group hover:border-muted-foreground/30 hover:bg-secondary transition-colors",
      )}
    >
      {card.art}

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-[10px] leading-tight font-semibold tracking-widest uppercase",
            card.accent,
          )}
        >
          {card.eyebrow}
        </p>
        {/* `title` so a long name is readable on hover instead of just cut. */}
        <p title={card.title} className="font-heading truncate text-sm leading-snug font-semibold">
          {card.title}
        </p>
        {card.subtitle ? (
          <p className="text-muted-foreground truncate font-mono text-[11px] leading-tight tabular-nums">
            {card.subtitle}
          </p>
        ) : null}
      </div>

      {card.value ? (
        // Right-aligned figure with its unit under it, mirroring the stat tiles: the
        // card is about WHAT the member plays, and this is how much.
        <div className="shrink-0 text-right">
          <p className="font-mono text-base leading-none font-bold tabular-nums">{card.value}</p>
          {card.valueLabel ? (
            <p className="text-muted-foreground mt-0.5 text-[10px] tracking-wide uppercase">
              {card.valueLabel}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
