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
          </div>
          {/* Both header cards are 118x153 (class and rank). */}
          <div className="flex items-center gap-3">
            <Skeleton className="h-[153px] w-[118px] rounded-lg" />
            <Skeleton className="h-[153px] w-[118px] rounded-lg" />
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

      {/* Medals (mirror MemberMedals: circular emblem + text, 2 wide columns) */}
      <div className="mt-10">
        <Skeleton className="mb-4 h-6 w-28" />
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-xl border p-4"
            >
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
