import Link from "next/link";

import { cn } from "@/lib/utils";

import { formatMonthLabel } from "../lib/format";
import { monthKeyToReference } from "@/lib/month";

interface RankingMonthPickerProps {
  /** Season keys with a board, newest first. */
  months: string[];
  /** The one being shown. */
  current: string;
  /** Key of the season in progress, labelled apart from the closed ones. */
  currentSeason: string;
  className?: string;
}

/**
 * Season switcher for /ranking.
 *
 * Deliberately plain links rather than a client-side control: switching seasons
 * re-renders the board on the server, which is the only place the delta maths
 * lives, and a URL per season means a member can share "look at June".
 */
export function RankingMonthPicker({
  months,
  current,
  currentSeason,
  className,
}: RankingMonthPickerProps) {
  // A single season is not a choice worth showing controls for.
  if (months.length < 2) return null;

  return (
    <nav
      aria-label="Temporadas do ranking"
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {months.map((month) => {
        const isCurrent = month === current;
        const isOpen = month === currentSeason;
        return (
          <Link
            key={month}
            // The open season is the page's default, so it gets the clean URL.
            href={isOpen ? "/ranking" : `/ranking?mes=${month}`}
            aria-current={isCurrent ? "page" : undefined}
            className={cn(
              "focus-visible:ring-ring rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition-colors focus-visible:ring-2 focus-visible:outline-none",
              isCurrent
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card/70 text-muted-foreground hover:text-foreground hover:border-foreground/30 backdrop-blur-sm",
            )}
          >
            {formatMonthLabel(monthKeyToReference(month))}
            {isOpen ? (
              <span
                className={cn(
                  "ml-1.5 font-normal normal-case",
                  isCurrent ? "text-primary-foreground/80" : "text-muted-foreground/70",
                )}
              >
                · em curso
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
