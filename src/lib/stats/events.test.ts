import { beforeEach, describe, expect, it, vi } from "vitest";

const db = {
  clanEvent: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
};
vi.mock("@/lib/db", () => ({ db }));

const { promotionFor, recordCollectionEvents, SESSION_WINDOW_MS } = await import("./events");
const { RANKS } = await import("@/lib/ranks");

const CABO = RANKS[1];
const TERCEIRO = RANKS[2];

beforeEach(() => {
  vi.clearAllMocks();
  db.clanEvent.findMany.mockResolvedValue([]);
  db.clanEvent.create.mockResolvedValue({});
  db.clanEvent.update.mockResolvedValue({});
});

describe("promotionFor", () => {
  it("names the rank when the credit crosses a threshold", () => {
    expect(promotionFor(CABO.threshold - 10, CABO.threshold)?.name).toBe("Cabo");
  });

  it("returns null when the credit stays inside the rank", () => {
    expect(promotionFor(CABO.threshold, CABO.threshold + 10)).toBeNull();
  });

  it("reports the HIGHEST rank reached when a credit skips one", () => {
    // A big session can cross two thresholds at once, and announcing the lower of
    // the two would be announcing a promotion the member no longer holds.
    expect(promotionFor(0, TERCEIRO.threshold)?.name).toBe(TERCEIRO.name);
  });

  it("never reports a demotion as an event", () => {
    expect(promotionFor(TERCEIRO.threshold, CABO.threshold)).toBeNull();
  });
});

describe("recordCollectionEvents", () => {
  const now = new Date("2026-07-28T22:00:00Z");

  it("does nothing when nobody was credited", async () => {
    await recordCollectionEvents([], now);
    expect(db.clanEvent.findMany).not.toHaveBeenCalled();
    expect(db.clanEvent.create).not.toHaveBeenCalled();
  });

  it("opens a session for a member with none in progress", async () => {
    await recordCollectionEvents(
      [{ memberId: "m1", pointsBefore: 1_000, pointsGained: 320, minutesGained: 45 }],
      now,
    );

    expect(db.clanEvent.create).toHaveBeenCalledTimes(1);
    expect(db.clanEvent.create.mock.calls[0][0].data).toMatchObject({
      memberId: "m1",
      kind: "session",
      points: 320,
      minutesPlayed: 45,
    });
  });

  it("extends the open session instead of appending a second row", async () => {
    // The reason the merge exists: readings land every 20 minutes, so an evening
    // of play would otherwise produce a dozen identical feed items.
    db.clanEvent.findMany.mockResolvedValue([{ id: "ev1", memberId: "m1" }]);

    await recordCollectionEvents(
      [{ memberId: "m1", pointsBefore: 1_000, pointsGained: 120, minutesGained: 20 }],
      now,
    );

    expect(db.clanEvent.create).not.toHaveBeenCalled();
    expect(db.clanEvent.update).toHaveBeenCalledTimes(1);
    const update = db.clanEvent.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: "ev1" });
    // Increment, not a computed total: the manual route can credit the same
    // member while the worker is mid cycle.
    expect(update.data).toEqual({
      points: { increment: 120 },
      minutesPlayed: { increment: 20 },
    });
  });

  it("only considers sessions inside the window as open", async () => {
    await recordCollectionEvents(
      [{ memberId: "m1", pointsBefore: 0, pointsGained: 10, minutesGained: 5 }],
      now,
    );

    const where = db.clanEvent.findMany.mock.calls[0][0].where;
    expect(where.kind).toBe("session");
    expect(where.updatedAt.gte).toEqual(new Date(now.getTime() - SESSION_WINDOW_MS));
  });

  it("appends a promotion alongside the session when a threshold is crossed", async () => {
    await recordCollectionEvents(
      [
        {
          memberId: "m1",
          pointsBefore: CABO.threshold - 10,
          pointsGained: 50,
          minutesGained: 30,
        },
      ],
      now,
    );

    const kinds = db.clanEvent.create.mock.calls.map(([args]) => args.data.kind);
    expect(kinds).toEqual(["session", "promotion"]);
    const promotion = db.clanEvent.create.mock.calls[1][0].data;
    // Slug, not name: it also addresses the insignia artwork.
    expect(promotion.rankSlug).toBe(CABO.slug);
  });

  it("swallows a database failure instead of costing the cycle its stats", async () => {
    // The snapshots are already written by the time this runs. A feed row is not
    // worth failing a collection over.
    db.clanEvent.findMany.mockRejectedValue(new Error("conexao caiu"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      recordCollectionEvents(
        [{ memberId: "m1", pointsBefore: 0, pointsGained: 10, minutesGained: 5 }],
        now,
      ),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
