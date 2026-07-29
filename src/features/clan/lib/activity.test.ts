import { describe, expect, it } from "vitest";

import { mergeActivity } from "./activity";
import type { ActivityEvent } from "./queries";

function event(id: string, updatedAt: string, points = 100): ActivityEvent {
  return {
    id,
    kind: "session",
    memberId: `m-${id}`,
    nickname: id,
    avatarUrl: null,
    occurredAt: updatedAt,
    updatedAt,
    points,
    minutesPlayed: 30,
    rankSlug: null,
  };
}

const LIMIT = 3;

describe("mergeActivity", () => {
  it("keeps the list untouched when the poll brings nothing", () => {
    const current = [event("a", "2026-07-28T22:00:00.000Z")];
    const result = mergeActivity(current, [], LIMIT);

    expect(result.events).toBe(current);
    expect(result.changed).toEqual([]);
  });

  it("adds a new event and marks it as changed", () => {
    const current = [event("a", "2026-07-28T22:00:00.000Z")];
    const result = mergeActivity(current, [event("b", "2026-07-28T22:30:00.000Z")], LIMIT);

    expect(result.events.map((e) => e.id)).toEqual(["b", "a"]);
    expect(result.changed).toEqual(["b"]);
  });

  it("replaces an event that grew instead of listing it twice", () => {
    // The case this exists for: a session is mutable, so the same row comes back
    // with more points while the member keeps playing.
    const current = [event("a", "2026-07-28T22:00:00.000Z", 100)];
    const result = mergeActivity(current, [event("a", "2026-07-28T22:20:00.000Z", 340)], LIMIT);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].points).toBe(340);
    expect(result.changed).toEqual(["a"]);
  });

  it("ignores an identical payload, so a no-op poll does not flash the list", () => {
    // Most polls are no-ops: the browser asks every 30 s and the collection runs
    // every 20 min.
    const current = [event("a", "2026-07-28T22:00:00.000Z")];
    const result = mergeActivity(current, [event("a", "2026-07-28T22:00:00.000Z")], LIMIT);

    expect(result.events).toBe(current);
    expect(result.changed).toEqual([]);
  });

  it("re-sorts so an extended session climbs back to the top", () => {
    const current = [
      event("b", "2026-07-28T22:30:00.000Z"),
      event("a", "2026-07-28T22:00:00.000Z"),
    ];
    const result = mergeActivity(current, [event("a", "2026-07-28T23:00:00.000Z")], LIMIT);

    expect(result.events.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("caps the list at the server's limit", () => {
    const current = [
      event("c", "2026-07-28T22:20:00.000Z"),
      event("b", "2026-07-28T22:10:00.000Z"),
      event("a", "2026-07-28T22:00:00.000Z"),
    ];
    const result = mergeActivity(current, [event("d", "2026-07-28T22:30:00.000Z")], LIMIT);

    expect(result.events.map((e) => e.id)).toEqual(["d", "c", "b"]);
  });

  it("never flashes a row that the cap pushed out of view", () => {
    const current = [
      event("c", "2026-07-28T22:20:00.000Z"),
      event("b", "2026-07-28T22:10:00.000Z"),
      event("a", "2026-07-28T22:00:00.000Z"),
    ];
    // Older than everything on screen: it merges, then falls off the end.
    const result = mergeActivity(current, [event("z", "2026-07-01T10:00:00.000Z")], LIMIT);

    expect(result.events.map((e) => e.id)).toEqual(["c", "b", "a"]);
    expect(result.changed).toEqual([]);
  });
});
