import { Crosshair, Flag, Map as MapIcon, type LucideIcon } from "lucide-react";
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

/** Per-kind label and fallback icon, in the order the rows should read. */
const KIND_META: Record<ProfileTopItem["kind"], { label: string; icon: LucideIcon }> = {
  weapon: { label: "Melhor arma", icon: Crosshair },
  gamemode: { label: "Modo mais jogado", icon: Flag },
  map: { label: "Mapa mais jogado", icon: MapIcon },
};

const KIND_ORDER: ProfileTopItem["kind"][] = ["weapon", "gamemode", "map"];

/** Hours out of seconds, reusing the formatter the stat tiles use. */
function hoursFromSeconds(seconds: number): string {
  return formatHours(Math.round(seconds / 60));
}

/**
 * The right-hand figures for a row, chosen by what the kind actually measures.
 *
 * A weapon is a tool, so it reports kills and accuracy. A map and a mode are places,
 * so they report time and how often the member wins there. Nothing shows a figure the
 * source does not publish for that kind, which is why this is a switch and not one
 * shared template.
 */
function detailFor(item: ProfileTopItem): string {
  if (item.kind === "weapon") {
    const parts = [`${formatNumber(item.kills)} kills`];
    if (item.accuracy !== null)
      parts.push(`${item.accuracy.toFixed(1).replace(".", ",")}% precisão`);
    return parts.join(" · ");
  }

  const parts = [hoursFromSeconds(item.secondsUsed)];
  // Win rate only when there are matches to divide by, so a member with time logged
  // and no completed round never shows "NaN%" or a plausible-looking 0 %.
  if (item.matches > 0) parts.push(`${formatPercent(item.wins / item.matches)} vitórias`);
  return parts.join(" · ");
}

/**
 * The member's standing IN THE GAME: the LEFT column of the stats section.
 *
 * A column of its own rather than a card in the header (clan owner, 2026-07-29): the
 * header keeps the CLAN rank, which is the ladder the clan competes on, and the game's
 * own progression lives here. Four rows at most: the level, then the best weapon, the
 * most-played mode and the most-played map. The width cap lives on the grid column in
 * the page, not here, so this component works at whatever width it is given.
 *
 * ONE OF EACH, not a top three (clan owner, 2026-07-29). Which is also why the rows
 * are a fixed order rather than sorted by anything: they answer three different
 * questions, so ranking them against each other would mean nothing.
 *
 * Styled to match `PlayerStats` on purpose: the two sit side by side and have to read
 * as one system rather than two designs.
 *
 * Renders nothing at all when there is neither a rank nor an item. That is the normal
 * state for most of the roster right now, not an edge case: the profile pass reads 10
 * members per cycle, so the game rank arrives hours after a member does, and the top
 * items arrive on the first cycle that reads them. A heading over an empty row would
 * announce a hole that fills itself.
 */
export function GameProfilePanel({ game, topItems, className }: GameProfilePanelProps) {
  const byKind = new Map(topItems.map((item) => [item.kind, item]));
  const rows = KIND_ORDER.map((kind) => byKind.get(kind)).filter(
    (item): item is ProfileTopItem => item !== undefined,
  );

  if (!game.rankName && rows.length === 0) return null;

  return (
    <div className={cn("grid grid-cols-1 gap-2", className)}>
      {game.rankName ? (
        <Row
          art={
            game.rankImageUrl ? (
              <Image
                src={game.rankImageUrl}
                alt=""
                width={40}
                height={40}
                className="size-9 shrink-0 object-contain"
                // EA's insignia are already sized for this, so the optimizer would
                // only add a hop through our own server for a 3 KB asset.
                unoptimized
              />
            ) : null
          }
          title={game.rankLevel === null ? game.rankName : `Nível ${game.rankLevel}`}
          label={game.rankLevel === null ? "Patente no Battlefield 6" : game.rankName}
        />
      ) : null}

      {rows.map((item) => {
        const { label, icon: Icon } = KIND_META[item.kind];
        return (
          <Row
            key={item.kind}
            art={
              item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt=""
                  width={40}
                  height={40}
                  className="size-9 shrink-0 object-contain"
                  unoptimized
                />
              ) : (
                // No artwork: a mode, whose art is SVG and is dropped at collection
                // time (serving third-party SVG through next/image needs
                // `dangerouslyAllowSVG`). Our own icon fills the same box.
                <Icon aria-hidden className="text-muted-foreground size-9 shrink-0 p-1.5" />
              )
            }
            title={item.name}
            label={label}
            detail={detailFor(item)}
          />
        );
      })}
    </div>
  );
}

/** One row of the panel, so the four of them cannot drift apart. */
function Row({
  art,
  title,
  label,
  detail,
}: {
  art: React.ReactNode;
  title: string;
  label: string;
  detail?: string;
}) {
  return (
    <div className="bg-secondary/80 flex items-center gap-3 rounded-md border px-3 py-2 backdrop-blur-sm">
      {art ?? <div aria-hidden className="size-9 shrink-0" />}

      <div className="min-w-0 flex-1">
        <p className="font-mono text-sm leading-tight font-semibold tabular-nums">{title}</p>
        <p className="text-muted-foreground truncate text-[11px] tracking-wide uppercase">
          {label}
        </p>
      </div>

      {detail ? (
        // Right-aligned and secondary: the row is about WHAT the member plays, and
        // these are the supporting numbers.
        <p className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">{detail}</p>
      ) : null}
    </div>
  );
}
