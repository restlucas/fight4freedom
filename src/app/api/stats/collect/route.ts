// Scheduled stats collection endpoint. A scheduler (Supabase pg_cron — see
// docs/plano.md "Agendamento" — or Vercel Cron/GitHub Actions) calls this every
// 10 minutes with `Authorization: Bearer $CRON_SECRET`.
//
// The route is a thin trigger: all the logic lives in src/lib/stats/collect.ts
// so it can be exercised without HTTP. GET and POST both work because
// schedulers disagree on the verb (Vercel Cron sends GET, pg_net usually POST).

import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

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

async function handleCollect(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const report = await collectStats();

  // The vitrine caches stats-derived pages; only purge when something changed.
  if (report.updated > 0) revalidateVitrine(CACHE_TAG.stats);

  console.info(
    `[stats] coleta: ${report.updated} atualizados, ${report.unchanged} sem mudança, ` +
      `${report.noData} sem dado, ${report.identityPending} sem identidade ` +
      `(${report.eligible} elegíveis)`,
  );
  return NextResponse.json(report);
}

export { handleCollect as GET, handleCollect as POST };
