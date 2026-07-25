import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="mb-8 space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-52" />
      </div>

      {/* Filter panel (mirror MembersList: search + 4 sort chips) */}
      <div className="bg-card/70 mb-6 flex flex-wrap items-center gap-3 rounded-xl border p-3">
        <Skeleton className="h-9 w-full max-w-xs" />
        <Skeleton className="h-4 w-16" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-16 rounded-full" />
        ))}
      </div>

      {/* Member cards (mirror MemberCard: square avatar + 4-stat row) */}
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card/80 rounded-xl border p-6">
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="size-14 rounded-lg" />
              <div className="grow basis-32 space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="size-5 rounded" />
              </div>
              {/* Stacked medals + rank insignia, top right */}
              <div className="ml-auto flex items-center gap-2 self-start">
                <div className="flex">
                  {Array.from({ length: 4 }).map((_, k) => (
                    <Skeleton
                      key={k}
                      className="ring-card -ml-1.5 size-8 rounded-full ring-2 first:ml-0"
                    />
                  ))}
                </div>
                <Skeleton className="size-8" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-10" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
