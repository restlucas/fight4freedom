import { HelpCircle } from "lucide-react";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { POINT_WEIGHTS, SCORED_STATS } from "@/lib/stats/points";

/**
 * The scoring rules, behind a "?" next to the season line on /ranking.
 *
 * They used to sit in a footer under the board. Moving them up here trades a
 * block nobody scrolls to for an affordance right where the question occurs —
 * next to the number the member is questioning.
 *
 * The trigger is a real `<button>`, not a bare icon: Radix opens a hover card on
 * FOCUS as well as on pointer, so keyboard users reach it with Tab and a tap on
 * touch focuses it. A `<span>` would be invisible to both.
 */
export function RankingScoringHelp() {
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label="Como pontuamos o ranking"
          className="text-muted-foreground hover:text-foreground hover:border-foreground/40 focus-visible:ring-ring inline-flex size-5 shrink-0 items-center justify-center rounded-full border align-middle transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <HelpCircle className="size-3.5" aria-hidden />
        </button>
      </HoverCardTrigger>

      <HoverCardContent align="start" className="w-80 text-xs leading-relaxed">
        <p className="font-heading mb-1.5 text-sm font-bold">Como pontuamos</p>
        <p className="text-muted-foreground">
          Jogo em equipe vale mais que abate, e conta apenas o progresso feito dentro do mês.
        </p>

        <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1">
          {SCORED_STATS.map(({ key, label }) => (
            <li key={key} className="flex items-baseline justify-between gap-2">
              <span className="text-muted-foreground truncate">{label}</span>
              <span className="font-mono font-semibold tabular-nums">+{POINT_WEIGHTS[key]}</span>
            </li>
          ))}
        </ul>

        <p className="text-muted-foreground mt-2.5 border-t pt-2">
          Tempo em cima do objetivo e cura também pontuam. Morte não desconta, e reparo de veículo
          não pontua para não penalizar quem não joga Engenheiro.
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}
