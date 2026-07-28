// Manual collection trigger. NOT the scheduled cycle any more.
//
// The real cycle runs on Railway (worker/main.ts, cron every 10 min). This route
// stays for the times a human wants a collection right now — an admin who just
// fixed an EA id and does not want to wait for the tick — and it is what a future
// "collect now" button in the panel will call. Today it is reached with curl:
//
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
//     https://<dominio>/api/stats/collect
//
// It keeps the 60 s function limit, so it runs the ROUTE profile: 45 s of budget
// and two passes (src/lib/stats/collect.ts). On a full roster the second pass never
// starts and part of the queue is deferred — which is fine here in a way it never
// was for the scheduled cycle, because the worker sweeps everyone every 10 minutes
// regardless. Whatever this call cannot reach is not lost, just not immediate.
//
// WHAT USED TO BE HERE, and why it is gone (2026-07-28). The route chained up to
// four successor invocations of itself via `after()`, each continuing the queue,
// because one 60 s function could not sweep ~75 members. It worked, and it was the
// only piece of the project that ran without an external brake — hence the
// MAX_CHAIN_DEPTH backstop. The worker made the whole mechanism pointless: the
// first real cycle swept 75 members in 164,9 s with `deferred: 0`, well inside its
// 8-minute budget. A self-invoking route is not worth keeping for a manual button.
//
// GET and POST both work: a manual trigger is easier to fire with whichever verb
// the caller has at hand.

import { NextResponse } from "next/server";

import { isCronAuthorized } from "@/lib/auth/cron";
import { CACHE_TAG, revalidateVitrine } from "@/lib/cache";
import { collectStats } from "@/lib/stats/collect";

export const dynamic = "force-dynamic";
// The cap the ROUTE profile's 45 s budget is measured against. It stops a hung
// upstream from holding the function open for the whole limit.
export const maxDuration = 60;

async function handleCollect(request: Request): Promise<NextResponse> {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const report = await collectStats();

  // The vitrine caches stats-derived pages; only purge when something changed.
  if (report.updated > 0) revalidateVitrine(CACHE_TAG.stats);

  console.info(
    `[stats] coleta manual: ${report.updated} atualizados, ${report.unchanged} sem mudança, ` +
      `${report.noData} sem dado, ${report.identityPending} sem identidade, ` +
      `${report.deferred} adiados (${report.eligible} elegíveis) — ` +
      `${report.roundsRun} rodada(s), ${report.recoveredByRetry} resgatado(s)`,
  );
  return NextResponse.json(report);
}

export { handleCollect as GET, handleCollect as POST };
