import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STATS_BATCH_SIZE } from "./gametools";
import type { PlayerIdentity, RawStats, StatsProvider } from "./provider";

/**
 * The collector talks to the database, so these tests stub `@/lib/db` rather than
 * reaching Supabase. What is worth locking here is the ORCHESTRATION, which is
 * where the bugs were: batch size, per-batch persistence, queue order and the
 * time budget. The per-player translation is covered in gametools.test.ts.
 */
const db = {
  member: { findMany: vi.fn(), update: vi.fn() },
  statSnapshot: { findMany: vi.fn(), createMany: vi.fn() },
};
vi.mock("@/lib/db", () => ({ db }));

const { collectStats } = await import("./collect");

/** A member row shaped like the collector's select. */
function member(nickname: string, capturedAt: string | null, index: number) {
  return {
    id: `id-${nickname}`,
    nickname,
    platformId: nickname,
    eaPersonaId: `persona-${index}`,
    eaNucleusId: `nucleus-${index}`,
    snapshots: capturedAt ? [{ capturedAt: new Date(capturedAt) }] : [],
  };
}

function rawStats(kills: number): RawStats {
  return {
    kills,
    deaths: 1,
    wins: 1,
    losses: 1,
    assists: 1,
    revives: 1,
    headshots: 1,
    objectivesCaptured: 1,
    timePlayedMinutes: 1,
    objectivesDefended: 1,
    objectivesDestroyed: 0,
    objectivesArmed: 0,
    objectivesDisarmed: 0,
    sectorsDefended: 0,
    objectiveTimeSeconds: 1,
    spots: 1,
    healthRestored: 1,
    repairs: 0,
    bestClass: null,
    matches: 2,
    secondsPlayed: 60,
    extra: {},
  };
}

/**
 * Provider that records the batches it was asked for.
 *
 * `costMs` moves a FAKE clock instead of sleeping. The collector measures its
 * budget with `Date.now()`, so advancing that is enough to exercise the timeout
 * path — sleeping for real would make this suite take a minute to prove nothing
 * extra.
 */
function fakeProvider(options: { costMs?: number } = {}): StatsProvider & {
  batches: PlayerIdentity[][];
} {
  const batches: PlayerIdentity[][] = [];
  return {
    batches,
    searchPlayer: vi.fn(async () => null),
    fetchStats: vi.fn(async (players: PlayerIdentity[]) => {
      batches.push(players);
      if (options.costMs) clock += options.costMs;
      return new Map(players.map((p, i) => [p.personaId, rawStats(100 + i)]));
    }),
  };
}

/** Fake wall clock, advanced by the provider stub above. */
let clock = 0;

beforeEach(() => {
  vi.clearAllMocks();
  db.statSnapshot.findMany.mockResolvedValue([]);
  db.statSnapshot.createMany.mockResolvedValue({ count: 0 });
  clock = 1_700_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => clock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("collectStats batching", () => {
  it(`splits the roster into batches of ${STATS_BATCH_SIZE}`, async () => {
    // 12 members -> 3 batches of 5, 5, 2. Ten per request returned 504 from the
    // API, so the size is a measured ceiling, not a preference.
    db.member.findMany.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => member(`M${i}`, null, i)),
    );
    const provider = fakeProvider();

    await collectStats(provider);

    expect(provider.batches.map((b) => b.length)).toEqual([5, 5, 2]);
  });

  it("persists each batch as it arrives, not once at the end", async () => {
    // The old shape accumulated every row and wrote once, so a run killed at the
    // function's time limit threw away everything it had already downloaded.
    db.member.findMany.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => member(`M${i}`, null, i)),
    );

    await collectStats(fakeProvider());

    expect(db.statSnapshot.createMany).toHaveBeenCalledTimes(3);
  });

  it("does not write a batch where nobody moved", async () => {
    db.member.findMany.mockResolvedValue([member("Solo", null, 0)]);
    // Latest snapshot identical to what the provider returns.
    db.statSnapshot.findMany.mockResolvedValue([
      { memberId: "id-Solo", kills: 100, deaths: 1, wins: 1, losses: 1, timePlayedMinutes: 1 },
    ]);

    const report = await collectStats(fakeProvider());

    expect(db.statSnapshot.createMany).not.toHaveBeenCalled();
    expect(report.unchanged).toBe(1);
    expect(report.updated).toBe(0);
  });
});

describe("collectStats queue order", () => {
  it("serves the stalest members first, never alphabetical", async () => {
    // With a fixed alphabetical order the tail of a 100-member roster would be
    // dropped every single cycle. Staleness ordering makes the queue self-balancing.
    db.member.findMany.mockResolvedValue([
      member("Ana", "2026-07-27T12:00:00Z", 1), // freshest
      member("Beto", "2026-07-20T12:00:00Z", 2),
      member("Caio", null, 3), // never collected
    ]);
    const provider = fakeProvider();

    await collectStats(provider);

    expect(provider.batches[0].map((p) => p.personaId)).toEqual([
      "persona-3", // never collected sorts first
      "persona-2",
      "persona-1",
    ]);
  });
});

describe("collectStats time budget", () => {
  it("stops before the function limit and reports what it deferred", async () => {
    // 40 members = 8 batches. At 8 s a batch the 45 s budget runs out partway
    // through, and the run must return a report instead of being killed mid-call.
    db.member.findMany.mockResolvedValue(
      Array.from({ length: 40 }, (_, i) => member(`M${String(i).padStart(2, "0")}`, null, i)),
    );
    const provider = fakeProvider({ costMs: 8_000 });

    const report = await collectStats(provider);

    // Six batches fit in 45 s; the seventh check finds the budget spent.
    expect(provider.batches.length).toBe(6);
    expect(report.deferred).toBe(40 - 6 * 5);
    // Everything it did fetch was written — the whole point of per-batch writes.
    expect(db.statSnapshot.createMany).toHaveBeenCalledTimes(6);
    expect(report.updated).toBe(30);
  });

  it("reports zero deferred when the whole roster fits", async () => {
    db.member.findMany.mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => member(`M${i}`, null, i)),
    );
    const report = await collectStats(fakeProvider());
    expect(report.deferred).toBe(0);
    expect(report.updated).toBe(8);
  });
});
