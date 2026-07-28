import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CollectReport } from "@/lib/stats/collect";

/**
 * The route is a manual trigger now — the scheduled cycle lives in worker/main.ts.
 * So what is worth pinning is small and unchanged by that move: the shared secret
 * has to gate it, and the cache must only be purged when a row was actually
 * written.
 *
 * The chain tests that used to dominate this file went away with the chain itself
 * (see the route's header). They existed because a route invoking itself had no
 * external brake; nothing here calls itself any more.
 */
const collectStats = vi.fn();
const revalidateVitrine = vi.fn();

vi.mock("@/lib/stats/collect", () => ({ collectStats }));
vi.mock("@/lib/cache", () => ({
  revalidateVitrine,
  CACHE_TAG: { members: "members", medals: "medals", stats: "stats" },
}));
vi.mock("@/lib/env", () => ({ serverEnv: { cronSecret: "s3cr3t" } }));

const { GET, POST } = await import("./route");

function report(overrides: Partial<CollectReport> = {}): CollectReport {
  return {
    eligible: 75,
    identitiesResolved: 0,
    updated: 1,
    unchanged: 70,
    noData: 4,
    identityPending: 0,
    deferred: 0,
    roundsRun: 2,
    retriedBatches: 4,
    recoveredByRetry: 11,
    members: [],
    ...overrides,
  };
}

function call(auth = "Bearer s3cr3t") {
  return POST(
    new Request("https://f4f.test/api/stats/collect", {
      method: "POST",
      headers: { Authorization: auth },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  collectStats.mockResolvedValue(report());
});

describe("authorization", () => {
  it("rejects a wrong secret without collecting anything", async () => {
    const response = await call("Bearer errado");

    expect(response.status).toBe(401);
    expect(collectStats).not.toHaveBeenCalled();
  });

  it("returns the report for the right secret", async () => {
    const response = await call();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ eligible: 75, recoveredByRetry: 11 });
  });
});

describe("verbs", () => {
  it("accepts GET as well, so a manual trigger works either way", async () => {
    const response = await GET(
      new Request("https://f4f.test/api/stats/collect", {
        headers: { Authorization: "Bearer s3cr3t" },
      }),
    );

    expect(response.status).toBe(200);
    expect(collectStats).toHaveBeenCalledTimes(1);
  });
});

describe("cache purge", () => {
  it("purges only when something was written", async () => {
    collectStats.mockResolvedValue(report({ updated: 0, unchanged: 71 }));
    await call();
    expect(revalidateVitrine).not.toHaveBeenCalled();

    collectStats.mockResolvedValue(report({ updated: 1 }));
    await call();
    expect(revalidateVitrine).toHaveBeenCalledWith("stats");
  });
});

describe("run profile", () => {
  it("takes the default (route) profile, not the worker's", async () => {
    // The route must not pass the worker's 8-minute budget: it would be killed at
    // the function's 60 s limit mid-write. Defaulting is how it stays right.
    await call();

    expect(collectStats).toHaveBeenCalledWith();
  });
});
