import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { memberInitials } from "../lib/format";
import type { MedalCatalogEntry } from "../lib/queries";
import { MedalEmblem, TIER_ACCENT } from "./medal-emblem";
import { MedalTierChip } from "./medal-tier-chip";

const MAX_VISIBLE_HOLDERS = 5;

interface MedalCardProps {
  medal: MedalCatalogEntry;
  className?: string;
}

/** Catalog card: emblem, name, rarity, description, criteria and who earned it. */
export function MedalCard({ medal, className }: MedalCardProps) {
  const visible = medal.holders.slice(0, MAX_VISIBLE_HOLDERS);
  const overflow = medal.holders.length - visible.length;

  return (
    <Card
      className={cn(
        "group hover:border-primary/40 relative h-full gap-0 overflow-hidden py-0 transition-colors",
        className,
      )}
    >
      {/* Tier glow behind the emblem. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -top-20 left-1/2 size-44 -translate-x-1/2 rounded-full bg-gradient-to-br opacity-30 blur-3xl",
          TIER_ACCENT[medal.tier].surface,
        )}
      />

      <div className="relative flex flex-col items-center gap-3 px-6 pt-7 text-center">
        <MedalEmblem
          name={medal.name}
          tier={medal.tier}
          imageUrl={medal.imageUrl}
          icon={medal.icon}
          size="lg"
          className="transition-transform duration-300 group-hover:scale-105"
        />
        <div className="w-full space-y-2">
          {/* Single line by design: a wrapped name would push the blocks below
              out of alignment with the neighbouring cards. */}
          <h3
            className="font-heading line-clamp-1 text-xl leading-tight font-bold"
            title={medal.name}
          >
            {medal.name}
          </h3>
          <MedalTierChip tier={medal.tier} />
        </div>
      </div>

      <CardContent className="mt-5 flex flex-1 flex-col gap-4 pb-6">
        {/* Every block below has a fixed height so the cards in a row line up
            no matter how long each medal's copy is. */}
        <p
          className="text-muted-foreground line-clamp-2 h-10 text-center text-sm"
          title={medal.description ?? undefined}
        >
          {medal.description}
        </p>

        <div className="bg-secondary/50 rounded-md border border-dashed p-3">
          <p className="text-muted-foreground text-[10px] font-semibold tracking-widest uppercase">
            Como conquistar
          </p>
          <p
            className={cn(
              "line-clamp-2 h-9 text-sm leading-snug",
              !medal.criteria && "text-muted-foreground italic",
            )}
            title={medal.criteria ?? undefined}
          >
            {medal.criteria ?? "A definir pelos oficiais."}
          </p>
        </div>

        <div className="mt-auto border-t pt-4">
          {/* min-h matches the avatar size so both states sit on the same line. */}
          <div className="flex min-h-7 items-center gap-3">
            {medal.holders.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                Ninguém conquistou ainda.
              </p>
            ) : (
              <>
                <div className="flex">
                  {visible.map((holder) => (
                    <Link
                      key={holder.id}
                      href={`/membros/${holder.id}`}
                      title={holder.nickname}
                      className="focus-visible:ring-ring -ml-2 rounded-full first:ml-0 focus-visible:z-10 focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <Avatar className="ring-card size-7 ring-2 transition-transform hover:-translate-y-0.5">
                        <AvatarImage
                          src={holder.avatarUrl ?? "/member-default.png"}
                          alt={holder.nickname}
                        />
                        <AvatarFallback className="font-heading text-[10px]">
                          {memberInitials(holder.nickname)}
                        </AvatarFallback>
                      </Avatar>
                    </Link>
                  ))}
                  {overflow > 0 ? (
                    <span className="bg-secondary ring-card text-muted-foreground -ml-2 flex size-7 items-center justify-center rounded-full text-[10px] font-medium ring-2">
                      +{overflow}
                    </span>
                  ) : null}
                </div>
                <span className="text-muted-foreground text-xs">
                  {medal.holders.length === 1
                    ? "1 conquistou"
                    : `${medal.holders.length} conquistaram`}
                </span>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
