// Dead man's switch for the collection cycle (Fase 11.1).
//
// WHAT THIS CATCHES THAT NOTHING ELSE DOES. Fase 6 made failure visible INSIDE a
// cycle: the panel says which members could not be read and why. Nothing was
// watching BETWEEN cycles. If the Railway container never starts, or the process
// dies before it writes anything, there is no log to read and no row to notice, and
// the symptom surfaces days later as "the numbers stopped moving".
//
// WHY AN OUTSIDE SERVICE, and not a table of our own. A table can only record runs
// that happened. The failure worth catching is the run that did not happen at all,
// and nothing inside the process can report its own absence. Whoever detects silence
// has to be outside the thing being silent.
//
// The shape is the standard one (healthchecks.io, Better Stack, cron-job.org all
// speak it): ping a URL when the run starts, ping it again when the run finishes, and
// let the service alert when the second ping does not arrive within the window it was
// configured for. `/fail` is sent explicitly on a crash so "did not run" and "ran and
// broke" stay different answers, which matter because they have different fixes.
//
// NEVER FATAL, in any direction. A healthcheck that can fail a cycle inverts its own
// purpose: the monitor would become the outage. Every function here swallows
// everything, and the cycle proceeds as if monitoring did not exist.

import { serverEnv } from "@/lib/env";

/** Seconds a ping may take before it is abandoned. */
const PING_TIMEOUT_MS = 10_000;

/**
 * Which moment of the run a ping reports.
 *
 * Deliberately the three the convention defines rather than something richer: the
 * value of this file is that any of the usual services understands it with no
 * adapter.
 */
type PingKind = "start" | "success" | "fail";

const PING_PATH: Record<PingKind, string> = {
  start: "/start",
  success: "",
  fail: "/fail",
};

/**
 * Sends one ping, swallowing every failure.
 *
 * `body` rides along as plain text because the services above store it and show it
 * next to the run. That is what turns the alert history into "how many members did
 * each of the last twenty cycles update", for free, without a table of our own.
 */
async function ping(kind: PingKind, body?: string): Promise<void> {
  const base = serverEnv.healthcheckUrl;
  // Not configured is not an error: local runs and CI have no monitor, and the
  // collection must work identically with and without one.
  if (!base) return;

  try {
    await fetch(`${base.replace(/\/+$/, "")}${PING_PATH[kind]}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: body ?? "",
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
  } catch (error) {
    // A warning, never a throw. The cycle's product is the snapshots, and they are
    // either already written or about to be.
    console.warn(
      `[healthcheck] ping ${kind} falhou:`,
      error instanceof Error ? error.message : error,
    );
  }
}

/** The run began. Starts the clock the monitor measures the window against. */
export function healthcheckStarted(): Promise<void> {
  return ping("start");
}

/**
 * The run finished, with a one-line summary attached.
 *
 * MUST BE SENT AFTER THE CACHE PURGE, not before. This is the last thing the cycle
 * does, so pinging earlier would report success for a cycle that could still fail on
 * its final step, and the monitor would go quiet about exactly the failure it exists
 * to see.
 */
export function healthcheckSucceeded(summary: string): Promise<void> {
  return ping("success", summary);
}

/** The run threw. Distinguishes "ran and broke" from "never ran". */
export function healthcheckFailed(error: unknown): Promise<void> {
  return ping("fail", error instanceof Error ? `${error.name}: ${error.message}` : String(error));
}
