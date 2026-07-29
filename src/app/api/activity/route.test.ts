import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActivityEvent } from "@/features/clan/lib/queries";

const getActivityFeed = vi.fn();
vi.mock("@/features/clan/lib/queries", () => ({ getActivityFeed }));

const { GET } = await import("./route");

function event(id: string, updatedAt: string): ActivityEvent {
  return {
    id,
    kind: "session",
    memberId: `m-${id}`,
    nickname: id,
    avatarUrl: null,
    occurredAt: updatedAt,
    updatedAt,
    points: 100,
    minutesPlayed: 30,
    rankSlug: null,
  };
}

const FEED = [event("b", "2026-07-28T23:00:00.000Z"), event("a", "2026-07-28T22:00:00.000Z")];

function get(query = ""): Promise<Response> {
  return GET(new Request(`https://f4f.test/api/activity${query}`));
}

beforeEach(() => {
  getActivityFeed.mockReset().mockResolvedValue(FEED);
});

describe("GET /api/activity", () => {
  it("returns the whole feed and its cursor on a first load", async () => {
    const body = await (await get()).json();

    expect(body.events.map((e: ActivityEvent) => e.id)).toEqual(["b", "a"]);
    // The cursor is the newest instant, which is what `since` echoes back.
    expect(body.cursor).toBe("2026-07-28T23:00:00.000Z");
  });

  it("returns only what changed after the cursor", async () => {
    const body = await (await get("?since=2026-07-28T22:00:00.000Z")).json();

    expect(body.events.map((e: ActivityEvent) => e.id)).toEqual(["b"]);
  });

  it("answers a caught-up client with an empty list, so it skips its re-render", async () => {
    const body = await (await get("?since=2026-07-28T23:00:00.000Z")).json();

    expect(body.events).toEqual([]);
    // Still the cursor: the client keeps a valid position even on a quiet poll.
    expect(body.cursor).toBe("2026-07-28T23:00:00.000Z");
  });

  it("treats a junk cursor as a first load instead of failing", async () => {
    // This endpoint is polled. A client with a bad cursor recovers by getting real
    // data; a 400 would leave it stuck on it.
    const response = await get("?since=ontem");

    expect(response.status).toBe(200);
    expect((await response.json()).events).toHaveLength(2);
  });

  it("reports a null cursor for an empty feed", async () => {
    getActivityFeed.mockResolvedValue([]);

    const body = await (await get()).json();

    expect(body).toEqual({ events: [], cursor: null });
  });
});
