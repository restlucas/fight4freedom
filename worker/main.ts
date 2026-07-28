// The stats collection cycle, as it actually runs in production: a Railway cron
// job, every 10 minutes.
//
// WHY THIS EXISTS AT ALL. The collector used to be a Vercel Route Handler, capped
// at 60 s by the plan. A gametools request that 504s always burns ~15,2 s (their
// gateway's clock, not work being done), so inside 60 s a retry could not be
// afforded: starting one near the deadline killed the function mid-write, and a
// killed function never reached the code that handed off to its successor, so the
// whole chain stopped. The cap did not make the failures rarer, it made them
// unrecoverable. Measured 2026-07-28: 14 % of batches failing, and the members in
// them lost for the cycle.
//
// Off Vercel the arithmetic changes completely. Nothing here makes the API answer
// better — 14 % of requests still die — but three passes over whoever is still
// unread leave ~0,3 % unread instead of 14 %, and the roster finishes in one
// execution instead of five chained ones.
//
// RUN ONCE AND EXIT, deliberately. Railway's cron restarts the container on
// schedule, so the schedule lives in Railway and not in a setInterval here. No
// timer to keep alive, no long-lived process to leak, and a crash is a failed
// execution the platform reports instead of a silent stall.
//
// The site is NOT called to collect. The worker writes snapshots to the same
// database the site reads, and only calls back to purge the vitrine's cache, which
// is the one step that needs Next (see src/app/api/stats/revalidate/route.ts).

import { db } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { collectStats, WORKER_BUDGET_MS, WORKER_ROUNDS } from "@/lib/stats/collect";

/**
 * Asks the site to drop the cached stats pages.
 *
 * Never fatal. The vitrine has a 300 s TTL as its safety net, so the worst case of
 * a failed purge is numbers appearing a few minutes late — not a reason to fail a
 * cycle whose writes already landed.
 */
async function purgeVitrineCache(): Promise<void> {
  try {
    const response = await fetch(`${serverEnv.siteUrl}/api/stats/revalidate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serverEnv.cronSecret}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      console.warn(`[worker] purga de cache respondeu ${response.status}`);
    }
  } catch (error) {
    console.warn(
      "[worker] nao foi possivel purgar o cache da vitrine:",
      error instanceof Error ? error.message : error,
    );
  }
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.info(`[worker] ciclo iniciado, orcamento ${WORKER_BUDGET_MS / 1000}s`);

  const report = await collectStats(undefined, {
    budgetMs: WORKER_BUDGET_MS,
    rounds: WORKER_ROUNDS,
  });

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.info(
    `[worker] ciclo concluido em ${seconds}s: ${report.updated} atualizados, ` +
      `${report.unchanged} sem mudanca, ${report.noData} sem dado, ` +
      `${report.identityPending} sem identidade, ${report.deferred} adiados ` +
      `(${report.eligible} elegiveis) | ${report.roundsRun} rodada(s), ` +
      `${report.retriedBatches} lote(s) retentado(s), ` +
      `${report.recoveredByRetry} membro(s) resgatado(s)`,
  );

  // `deferred > 0` means the 8-minute ceiling was hit with members never asked
  // about, which the measured ~4-minute sweep should never produce. Surfaced as a
  // warning because it is the signal that the source degraded, not a failure: the
  // next tick starts with exactly those members.
  if (report.deferred > 0) {
    console.warn(
      `[worker] ${report.deferred} membro(s) nao alcancados dentro do orcamento — ` +
        "a fonte esta mais lenta do que o medido, proximo ciclo comeca por eles",
    );
  }

  if (report.updated > 0) await purgeVitrineCache();
}

// Prisma holds the connection pool open, so the process would hang after main()
// resolves without an explicit disconnect. A cron job that never exits is a cron
// job that blocks its own next execution.
main()
  .then(async () => {
    await db.$disconnect();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error("[worker] ciclo falhou:", error);
    await db.$disconnect();
    // Non-zero so Railway marks the execution as failed instead of succeeded.
    process.exit(1);
  });
