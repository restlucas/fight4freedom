// Cache purge for a collection that ran OUTSIDE the app.
//
// The Railway worker (worker/main.ts) writes snapshots straight to the database,
// which is the whole point — the site stays a reader. But the vitrine caches
// stats-derived pages by tag, and `revalidateTag` only exists inside Next. So the
// worker finishes its cycle and calls this, and this is the one line of the
// collection the worker cannot do by itself.
//
// Without it the numbers would still appear, just late: `VITRINE_REVALIDATE_SECONDS`
// (300 s) is the safety net. A failed purge is therefore not an incident, which is
// why the worker logs it and moves on.

import { NextResponse } from "next/server";

import { isCronAuthorized } from "@/lib/auth/cron";
import { CACHE_TAG, revalidateVitrine } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  revalidateVitrine(CACHE_TAG.stats);
  return NextResponse.json({ revalidated: CACHE_TAG.stats });
}
