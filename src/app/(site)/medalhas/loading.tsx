import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="mb-8 space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Search bar */}
      <Skeleton className="mb-6 h-9 w-full max-w-sm" />

      {/* Medal cards (mirror MedalCard: circular emblem, name, tier, text, holders) */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border pt-7 pb-6">
            <div className="flex flex-col items-center gap-3 px-6">
              <Skeleton className="size-24 rounded-full" />
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
            <div className="mt-5 space-y-4 px-6">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-16 rounded-md" />
              <div className="flex items-center gap-3 border-t pt-4">
                <Skeleton className="size-7 rounded-full" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
