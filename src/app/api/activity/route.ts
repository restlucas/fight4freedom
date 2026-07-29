// The activity feed's live channel, polled by the home page.
//
// WHY POLLING AND NOT PUSH. The obvious alternatives were weighed and both cost
// more than they return here:
//
//   - SSE / a long-lived connection: the app runs on Vercel functions with a 60 s
//     ceiling, so the stream would die and reconnect every minute anyway. A
//     reconnect loop is a poll with extra machinery.
//   - Supabase Realtime on `stat_snapshot` / `clan_event`: genuinely push, and it
//     needs the table published plus anon SELECT granted on it. That is a new
//     public read path on the database for a feed that changes at most every 20
//     minutes.
//
// The producer is a cron job on a 20-minute cadence. Against that, a 30 s poll of
// a query bounded to 8 rows is already faster than the data can change, and it
// carries no infrastructure. Documented as a decision rather than left implicit,
// because "make it realtime" will come up again — the upgrade path is Realtime,
// and the trigger for taking it would be the cadence dropping to seconds.
//
// `since` makes the poll cheap for the client, not for the server: the query runs
// either way, but an unchanged feed answers with an empty list and the component
// skips its re-render.

import { NextResponse } from "next/server";

import { getActivityFeed, type ActivityEvent } from "@/features/clan/lib/queries";

export const dynamic = "force-dynamic";

export type ActivityResponse = {
  events: ActivityEvent[];
  /** Newest `updatedAt` on the feed, to be echoed back as `since`. */
  cursor: string | null;
};

export async function GET(request: Request): Promise<NextResponse<ActivityResponse>> {
  const since = new URL(request.url).searchParams.get("since");
  const feed = await getActivityFeed();
  const cursor = feed[0]?.updatedAt ?? null;

  // An invalid or absent `since` returns the whole feed, which is also what a
  // first load wants. Never a 400: this endpoint is polled, and a client that
  // sends a bad cursor should recover by getting real data, not an error.
  const sinceTime = since ? Date.parse(since) : NaN;
  const events = Number.isNaN(sinceTime)
    ? feed
    : feed.filter((event) => Date.parse(event.updatedAt) > sinceTime);

  return NextResponse.json({ events, cursor });
}
