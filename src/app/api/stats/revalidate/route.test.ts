import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * This route exists so the Railway worker can purge a cache it cannot reach, which
 * makes it a second door into the app opened by a shared secret. What is worth
 * pinning is therefore the door, not the purge: it must refuse anything that is not
 * the exact bearer token, and must not purge as a side effect of refusing.
 */
const revalidateVitrine = vi.fn();
vi.mock("@/lib/cache", () => ({
  revalidateVitrine,
  CACHE_TAG: { members: "members", medals: "medals", stats: "stats" },
}));
vi.mock("@/lib/env", () => ({ serverEnv: { cronSecret: "s3cr3t" } }));

const { POST } = await import("./route");

function request(authorization?: string): Request {
  return new Request("https://f4f.test/api/stats/revalidate", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/stats/revalidate", () => {
  it("purges the stats tag for the right secret", async () => {
    const response = await POST(request("Bearer s3cr3t"));

    expect(response.status).toBe(200);
    expect(revalidateVitrine).toHaveBeenCalledWith("stats");
  });

  it.each([
    ["no header at all", undefined],
    ["the wrong secret", "Bearer wrong"],
    ["the right secret without the scheme", "s3cr3t"],
    // Same length as "Bearer s3cr3t", last character changed: the guard must
    // compare content, not just size.
    ["a same-length near miss", "Bearer s3cr3X"],
  ])("refuses %s without purging anything", async (_label, authorization) => {
    const response = await POST(request(authorization));

    expect(response.status).toBe(401);
    expect(revalidateVitrine).not.toHaveBeenCalled();
  });
});
