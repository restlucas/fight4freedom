// Scheduled stats collection endpoint. A scheduler (Supabase pg_cron — see
// docs/plano.md "Agendamento" — or Vercel Cron/GitHub Actions) calls this every
// 10 minutes with `Authorization: Bearer $CRON_SECRET`.
//
// The route is a thin trigger: all the logic lives in src/lib/stats/collect.ts
// so it can be exercised without HTTP. GET and POST both work because
// schedulers disagree on the verb (Vercel Cron sends GET, pg_net usually POST).
//
// It does one thing beyond triggering: when a run ends with members still queued,
// it hands off to a successor run instead of leaving the rest of the cycle idle.
// See MAX_CHAIN_DEPTH for why that is bounded and why the bound is the important
// part.

import { timingSafeEqual } from "node:crypto";

import { after, NextResponse } from "next/server";

import { CACHE_TAG, revalidateVitrine } from "@/lib/cache";
import { serverEnv } from "@/lib/env";
import { collectStats } from "@/lib/stats/collect";

export const dynamic = "force-dynamic";
// Worst case: identity backlog + 5 cold batches. Comfortably under a minute in
// practice; the cap stops a hung upstream from holding the function forever.
export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
  let secret: string;
  try {
    secret = serverEnv.cronSecret;
  } catch {
    // Env not configured: fail closed, never open.
    return false;
  }
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * How many times a run may hand off to a successor within one scheduler tick.
 *
 * The reason continuation exists: a run stops at its time budget with members
 * still queued, and used to sit idle for the remaining nine minutes of the cycle.
 * Measured 2026-07-27 — 37 of 76 members per run — a full sweep needed two or
 * three ticks, so 20 to 30 minutes, against a source whose edge cache refreshes
 * every ~10 minutes. The roster was two thirds staler than it had to be.
 *
 * Four is the cap because four runs cover ~150 members, comfortably past the
 * current 99, and because a hard ceiling is what separates a chain from a loop:
 * a route that calls itself has no external brake, so if the "are we done?"
 * condition were ever wrong, this number is the only thing standing between a bug
 * and unbounded invocations.
 */
const MAX_CHAIN_DEPTH = 4;

/** Current position in the chain. Absent or malformed reads as the first run. */
function chainDepth(url: URL): number {
  const raw = Number(url.searchParams.get("chain"));
  if (!Number.isInteger(raw) || raw < 0) return 0;
  return Math.min(raw, MAX_CHAIN_DEPTH);
}

/**
 * Fires the successor run, same origin, same secret.
 *
 * Runs inside `after()`, so it happens once the response is already on its way
 * back to the scheduler. Awaiting it here instead would keep THIS function alive
 * for the successor's whole execution and blow the very time budget the chain
 * exists to work around.
 */
function triggerSuccessor(origin: string, nextDepth: number): void {
  after(async () => {
    try {
      const response = await fetch(`${origin}/api/stats/collect?chain=${nextDepth}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serverEnv.cronSecret}` },
      });
      if (!response.ok) {
        console.warn(`[stats] sucessora ${nextDepth} respondeu ${response.status}`);
      }
    } catch (error) {
      // A failed hand-off is not an incident: the scheduler's next tick starts
      // over, and the queue is ordered by staleness, so nobody is skipped.
      console.warn(
        `[stats] nao foi possivel disparar a sucessora ${nextDepth}:`,
        error instanceof Error ? error.message : error,
      );
    }
  });
}

async function handleCollect(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const depth = chainDepth(url);
  const report = await collectStats();

  // The vitrine caches stats-derived pages; only purge when something changed.
  if (report.updated > 0) revalidateVitrine(CACHE_TAG.stats);

  // Hand off only while there is queued work AND headroom in the chain. Both
  // conditions matter: the first stops the chain as soon as a sweep completes,
  // the second stops it even if the first is somehow wrong.
  const willContinue = report.deferred > 0 && depth < MAX_CHAIN_DEPTH;
  if (willContinue) triggerSuccessor(url.origin, depth + 1);

  console.info(
    `[stats] coleta ${depth + 1}/${MAX_CHAIN_DEPTH + 1}: ${report.updated} atualizados, ` +
      `${report.unchanged} sem mudança, ${report.noData} sem dado, ` +
      `${report.identityPending} sem identidade, ${report.deferred} adiados ` +
      `(${report.eligible} elegíveis)` +
      (willContinue ? " — disparando sucessora" : ""),
  );
  return NextResponse.json({ ...report, chain: { depth, willContinue } });
}

export { handleCollect as GET, handleCollect as POST };
