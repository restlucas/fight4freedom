import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="mb-5 space-y-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Season picker chips (mirror RankingMonthPicker) */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[30px] w-24 rounded-full" />
        ))}
      </div>

      {/* Search panel: field, counter, and the countdown pinned right, all on one
          row (mirror RankingList's glass panel, including its sm:h-15 cap). */}
      <div className="mb-4 flex items-center gap-4 rounded-xl border p-3 md:h-15">
        <Skeleton className="h-9 w-full max-w-xs" />
        <Skeleton className="h-4 w-16" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-2.5 w-20" />
          {/* Countdown unit chips, single line each */}
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[26px] w-10 rounded-md" />
          ))}
        </div>
      </div>

      {/* Ranking rows (mirror RankingRow height), with the top-squad divider */}
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[58px] rounded-lg" />
        ))}
        <div className="flex items-center gap-3 py-2">
          <Skeleton className="h-px flex-1" />
          <Skeleton className="h-2.5 w-28" />
          <Skeleton className="h-px flex-1" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[58px] rounded-lg" />
        ))}
      </div>
    </main>
  );
}
