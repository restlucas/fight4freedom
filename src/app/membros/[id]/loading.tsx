import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <Skeleton className="mb-6 h-4 w-24" />

      {/* Header */}
      <div className="rounded-xl border p-6 sm:p-8">
        <div className="flex flex-col items-center gap-5 sm:flex-row">
          <Skeleton className="size-24 rounded-xl sm:size-28" />
          <div className="w-full max-w-xs space-y-3">
            <Skeleton className="h-9 w-56" />
            <div className="flex justify-center gap-2 sm:justify-start">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Stats (12-cell grid) */}
      <div className="mt-10">
        <Skeleton className="mb-4 h-6 w-32" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-md" />
          ))}
        </div>
      </div>

      {/* Medals */}
      <div className="mt-10">
        <Skeleton className="mb-4 h-6 w-28" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      </div>
    </main>
  );
}
