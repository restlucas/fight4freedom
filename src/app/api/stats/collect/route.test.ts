import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CollectReport } from "@/lib/stats/collect";

/**
 * These exist for the chain. A route that invokes itself is the one piece of this
 * project that could, if its stop condition were wrong, run without an external
 * brake — so the conditions that stop it are worth pinning down explicitly.
 */
const collectStats = vi.fn();
const revalidateVitrine = vi.fn();
/** `after` callbacks run immediately here, so the hand-off is observable. */
const after = vi.fn((fn: () => unknown) => {
  void fn();
});

vi.mock("@/lib/stats/collect", () => ({ collectStats }));
vi.mock("@/lib/cache", () => ({
  revalidateVitrine,
  CACHE_TAG: { members: "members", medals: "medals", stats: "stats" },
}));
vi.mock("@/lib/env", () => ({ serverEnv: { cronSecret: "s3cr3t" } }));
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after };
});

const { POST } = await import("./route");

function report(overrides: Partial<CollectReport> = {}): CollectReport {
  return {
    eligible: 76,
    identitiesResolved: 0,
    updated: 37,
    unchanged: 0,
    noData: 0,
    identityPending: 23,
    deferred: 0,
    members: [],
    ...overrides,
  };
}

function call(url = "https://f4f.test/api/stats/collect", auth = "Bearer s3cr3t") {
  return POST(new Request(url, { method: "POST", headers: { Authorization: auth } }));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authorization", () => {
  it("rejects a wrong secret without collecting anything", async () => {
    const response = await call(undefined, "Bearer errado");
    expect(response.status).toBe(401);
    expect(collectStats).not.toHaveBeenCalled();
  });
});

describe("chain hand-off", () => {
  it("fires a successor when members were deferred", async () => {
    collectStats.mockResolvedValue(report({ deferred: 39 }));

    const response = await call();
    const body = await response.json();

    expect(body.chain).toEqual({ depth: 0, willContinue: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://f4f.test/api/stats/collect?chain=1");
    expect(init.headers.Authorization).toBe("Bearer s3cr3t");
  });

  it("stops as soon as a sweep completes", async () => {
    // The primary stop condition: nothing left queued, so no successor.
    collectStats.mockResolvedValue(report({ deferred: 0 }));

    const body = await (await call()).json();

    expect(body.chain.willContinue).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops at the depth cap even with work still queued", async () => {
    // The backstop. This is what keeps a chain from being a loop if the deferred
    // count were ever wrong.
    collectStats.mockResolvedValue(report({ deferred: 500 }));

    const body = await (await call("https://f4f.test/api/stats/collect?chain=4")).json();

    expect(body.chain).toEqual({ depth: 4, willContinue: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clamps a depth beyond the cap instead of trusting the caller", async () => {
    collectStats.mockResolvedValue(report({ deferred: 500 }));

    const body = await (await call("https://f4f.test/api/stats/collect?chain=99")).json();

    expect(body.chain.depth).toBe(4);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a malformed depth as the first run", async () => {
    collectStats.mockResolvedValue(report({ deferred: 10 }));

    for (const raw of ["abc", "-3", "1.5", ""]) {
      fetchMock.mockClear();
      const body = await (await call(`https://f4f.test/api/stats/collect?chain=${raw}`)).json();
      expect(body.chain.depth).toBe(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("keeps the successor on the same origin the scheduler used", async () => {
    // Built from the incoming request, so it follows preview and custom domains
    // instead of a hardcoded production URL.
    collectStats.mockResolvedValue(report({ deferred: 5 }));

    await call("https://preview-123.vercel.app/api/stats/collect");

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://preview-123.vercel.app/api/stats/collect?chain=1",
    );
  });

  it("survives a hand-off that fails", async () => {
    // The scheduler's next tick starts over, and the queue is ordered by
    // staleness, so a lost hand-off costs time and never data.
    collectStats.mockResolvedValue(report({ deferred: 5 }));
    fetchMock.mockRejectedValue(new Error("rede caiu"));

    const response = await call();

    expect(response.status).toBe(200);
    expect((await response.json()).chain.willContinue).toBe(true);
  });
});

describe("cache purge", () => {
  it("purges only when something was written", async () => {
    collectStats.mockResolvedValue(report({ updated: 0, unchanged: 76 }));
    await call();
    expect(revalidateVitrine).not.toHaveBeenCalled();

    collectStats.mockResolvedValue(report({ updated: 1 }));
    await call();
    expect(revalidateVitrine).toHaveBeenCalledWith("stats");
  });
});
