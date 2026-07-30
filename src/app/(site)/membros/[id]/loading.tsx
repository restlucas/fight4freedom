import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <Skeleton className="mb-6 h-4 w-24" />

      {/* Header: avatar, identity, best class and rank cards */}
      <div className="rounded-xl border p-6 sm:p-8">
        <div className="flex flex-col items-center gap-5 sm:flex-row">
          <Skeleton className="size-24 rounded-xl sm:size-28" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-9 w-56" />
            <div className="flex justify-center gap-2 sm:justify-start">
              <Skeleton className="size-5 rounded" />
              <Skeleton className="h-6 w-40" />
            </div>
            {/* The bio, at its `text-sm` height. Whether a member has one does not
                move the header — the 153px cards set that — so mirroring the
                populated column costs nothing when the bio turns out to be empty. */}
            <Skeleton className="h-6 w-full" />
          </div>
          {/* Both header cards are 118x153 (class and rank). */}
          <div className="flex items-center gap-3">
            <Skeleton className="h-[153px] w-[118px] rounded-lg" />
            <Skeleton className="h-[153px] w-[118px] rounded-lg" />
          </div>
        </div>
      </div>

      {/* Stats, mirroring the two columns: the game panel capped at 20rem on the left
          (4 rows: level, weapon, mode, map), and 15 tiles in three columns on the
          right (12 counters plus insígnias, dog tags and XP). The Redsec division
          would be a 16th and is left out on purpose — it only renders for a member who
          actually holds one, which is nearly nobody. */}
      <div className="mt-10">
        <Skeleton className="mb-4 h-6 w-32" />
        <div className="grid gap-2 lg:grid-cols-[minmax(0,20rem)_1fr]">
          {/* Four cards splitting the column height, so `flex-1` here too. */}
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="min-h-16 flex-1 rounded-lg" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Array.from({ length: 15 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-md" />
            ))}
          </div>
        </div>
      </div>

      {/* Progression (mirror MemberProgression: metric row, then a 260px plot with
          y-axis labels down the left) */}
      <div className="mt-10">
        <Skeleton className="mb-4 h-6 w-32" />
        {/* Forecast panel: two insignias, two lines of copy, then the bar. */}
        <div className="mb-3 rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 rounded" />
            <Skeleton className="size-4 rounded" />
            <Skeleton className="size-10 rounded" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
          <Skeleton className="mt-2 h-3 w-72" />
        </div>
        <div className="space-y-3 rounded-xl border p-4 sm:p-5">
          <div className="flex flex-wrap gap-1.5">
            {/* One per metric button, sized after its label ("Pontos", "Kills",
                "K/D", "Partidas"). Indexed keys because the widths repeat — two
                buttons are w-20, and keying by the class collided. */}
            {["w-20", "w-16", "w-14", "w-20"].map((width, i) => (
              <Skeleton key={i} className={`h-8 ${width} rounded-md`} />
            ))}
          </div>
          <div className="flex gap-3">
            <div className="flex h-[260px] w-[52px] flex-col justify-between py-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-3 w-10" />
              ))}
            </div>
            <Skeleton className="h-[260px] flex-1 rounded-md" />
          </div>
        </div>
      </div>

      {/* Medals (mirror MemberMedals: circular emblem + text, 2 wide columns) */}
      <div className="mt-10">
        <Skeleton className="mb-4 h-6 w-28" />
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-xl border p-4">
              <Skeleton className="size-16 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
