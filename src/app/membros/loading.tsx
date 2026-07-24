import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="mb-8 space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-52" />
      </div>

      {/* Search bar */}
      <Skeleton className="mb-6 h-9 w-full max-w-sm" />

      {/* Member cards (mirror MemberCard: header + 4-stat row) */}
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border p-6">
            <div className="flex items-center gap-3">
              <Skeleton className="size-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <Skeleton className="h-4 w-8" />
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
