import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors the populated page: header, then one account card with its 56px rank
 * insignia, two title lines and the 2/3-column grid of stat tiles.
 *
 * Worth a real skeleton rather than a spinner because this page ALWAYS waits on
 * the network — it reads the live EA source on every render — so this is what a
 * member sees on their very first visit to the site.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <Skeleton className="h-9 w-72" />
      <div className="mt-2 space-y-2">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-4/5" />
      </div>

      <div className="mt-8">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-2 h-4 w-full" />

        <div className="bg-card mt-4 rounded-xl border p-5">
          <div className="flex items-start gap-4">
            <Skeleton className="size-14 shrink-0 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="bg-muted/40 rounded-lg px-3 py-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="mt-1.5 h-6 w-20" />
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 flex-1" />
          </div>
        </div>
      </div>
    </main>
  );
}
