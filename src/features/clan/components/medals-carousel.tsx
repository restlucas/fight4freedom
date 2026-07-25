"use client";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

import type { MedalCatalogEntry } from "../lib/queries";
import { MedalEmblem } from "./medal-emblem";
import { MedalTierChip } from "./medal-tier-chip";

interface MedalsCarouselProps {
  medals: MedalCatalogEntry[];
}

/**
 * Home page showcase: real medals from the catalog instead of a hardcoded list
 * of tiers. One per slide on mobile, up to four on wide screens.
 */
export function MedalsCarousel({ medals }: MedalsCarouselProps) {
  if (medals.length === 0) return null;

  return (
    <Carousel
      opts={{ align: "start", loop: medals.length > 4 }}
      className="mx-auto w-full max-w-5xl"
    >
      <CarouselContent className="-ml-4">
        {medals.map((medal) => (
          <CarouselItem
            key={medal.id}
            className="basis-full pl-4 sm:basis-1/2 lg:basis-1/3 xl:basis-1/4"
          >
            <div className="bg-card/70 flex h-full flex-col items-center gap-3 rounded-xl border p-6 text-center backdrop-blur-sm">
              <MedalEmblem
                name={medal.name}
                tier={medal.tier}
                imageUrl={medal.imageUrl}
                icon={medal.icon}
                size="lg"
              />
              <div className="space-y-2">
                <h3 className="font-heading line-clamp-1 text-lg font-semibold">
                  {medal.name}
                </h3>
                <MedalTierChip tier={medal.tier} />
              </div>
              {medal.criteria ? (
                <p className="text-muted-foreground line-clamp-2 text-sm">
                  {medal.criteria}
                </p>
              ) : null}
              <p className="text-muted-foreground mt-auto text-xs">
                {medal.holders.length === 0
                  ? "Ninguém conquistou ainda"
                  : `${medal.holders.length} ${
                      medal.holders.length === 1 ? "conquistou" : "conquistaram"
                    }`}
              </p>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>

      {/* Inside the track on mobile, outside it from sm up. */}
      <CarouselPrevious className="left-1 sm:-left-12" />
      <CarouselNext className="right-1 sm:-right-12" />
    </Carousel>
  );
}
