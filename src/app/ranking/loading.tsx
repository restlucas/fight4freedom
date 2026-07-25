import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="mb-5 space-y-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Season bar (mirror RankingSeasonBar: leader on the left, timer right) */}
      <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border px-4 py-3">
        <div className="flex items-center gap-3">
          <Skeleton className="size-11 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-5 w-36" />
          </div>
          {/* Points chip */}
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
        <div className="flex flex-col items-end gap-1">
          <Skeleton className="h-2.5 w-16" />
          {/* Countdown unit boxes */}
          <div className="flex items-center gap-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[30px] w-9 rounded-md" />
            ))}
          </div>
        </div>
      </div>

      {/* Search panel + counter (mirror RankingList's glass panel) */}
      <div className="mb-4 flex items-center gap-4 rounded-xl border p-3">
        <Skeleton className="h-9 w-full max-w-xs" />
        <Skeleton className="h-4 w-16" />
      </div>

      {/* Ranking rows (mirror RankingRow height) */}
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-[58px] rounded-lg" />
        ))}
      </div>
    </main>
  );
}
