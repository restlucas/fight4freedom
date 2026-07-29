// "Faltam 12.000 pts para Major, cerca de 80 h no seu ritmo."
//
// Its own block on the profile rather than more text inside the RankCard's hover
// card, for two reasons. The hover card does not exist on touch, which is most of
// the clan; and a goal that has to be discovered by hovering is not a goal, it is
// a detail.

import { ArrowRight } from "lucide-react";

import { insigniaPath, rankProgress } from "@/lib/ranks";
import { cn } from "@/lib/utils";
import Image from "next/image";

import { rankForecast } from "../lib/forecast";
import { formatNumber, formatPoints } from "../lib/format";
import type { ProgressionPoint } from "../lib/progression";

interface RankForecastPanelProps {
  points: number;
  series: ProgressionPoint[];
  className?: string;
}

export function RankForecastPanel({ points, series, className }: RankForecastPanelProps) {
  const forecast = rankForecast(points, series);
  const { rank, fraction } = rankProgress(points);

  if (!forecast) {
    return (
      <div className={cn("bg-secondary/70 rounded-xl border p-4 backdrop-blur-sm", className)}>
        <p className="font-heading text-sm font-semibold">Patente máxima do clã</p>
        <p className="text-muted-foreground mt-1 text-sm">
          {rank.name} é o topo da escada. Não há próxima promoção a caçar.
        </p>
      </div>
    );
  }

  const hours = Math.max(1, Math.round(forecast.hoursToNext));

  return (
    <div className={cn("bg-secondary/70 rounded-xl border p-4 backdrop-blur-sm", className)}>
      <div className="flex items-center gap-3">
        <Image
          src={insigniaPath(rank)}
          alt=""
          width={32}
          height={32}
          className="size-8 shrink-0 object-contain opacity-60"
        />
        <ArrowRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
        <Image
          src={insigniaPath(forecast.next)}
          alt=""
          width={40}
          height={40}
          className="size-10 shrink-0 object-contain"
        />

        <div className="min-w-0 flex-1">
          <p className="font-heading truncate text-sm font-semibold">
            Próxima patente: {forecast.next.name}
          </p>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Faltam{" "}
            <span className="text-foreground font-mono font-medium tabular-nums">
              {formatPoints(forecast.pointsToNext)}
            </span>{" "}
            pts, cerca de{" "}
            <span className="text-foreground font-mono font-medium tabular-nums">{hours} h</span> de
            jogo
            {forecast.basis === "member" ? " no seu ritmo" : " no ritmo médio do clã"}.
          </p>
        </div>
      </div>

      {/* Same progress as the rank card in the header, at a size that can be read
          without hovering.
          The accessible name states the GAP rather than repeating the card's
          "Progresso para X": two bars on one page answering to the same name is
          ambiguous for a screen reader, and this one is the place where the actual
          number is worth announcing. */}
      <div
        className="bg-background/60 mt-3 h-1.5 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
        aria-label={`Faltam ${formatPoints(forecast.pointsToNext)} pontos para ${forecast.next.name}`}
      >
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-700"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>

      <p className="text-muted-foreground mt-2 text-[11px]">
        {forecast.basis === "member" ? (
          <>
            Estimado em {formatNumber(Math.round(forecast.rate))} pontos por hora, medidos nas suas
            leituras.
          </>
        ) : (
          <>
            Estimado em {formatNumber(Math.round(forecast.rate))} pontos por hora, a média do clã.
            Assim que você tiver mais horas coletadas, a conta passa a usar o seu ritmo.
          </>
        )}
      </p>
    </div>
  );
}
