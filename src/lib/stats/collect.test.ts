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
  member: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  statSnapshot: { findMany: vi.fn(), createMany: vi.fn() },
};
vi.mock("@/lib/db", () => ({ db }));

const { collectStats } = await import("./collect");

/**
 * A member row shaped like the collector's select. `checkedAt` is when the
 * collector last TRIED them, which is what orders the queue.
 */
function member(nickname: string, checkedAt: string | null, index: number) {
  return {
    id: `id-${nickname}`,
    nickname,
    platformId: nickname,
    eaPersonaId: `persona-${index}`,
    eaNucleusId: `nucleus-${index}`,
    statsCheckedAt: checkedAt ? new Date(checkedAt) : null,
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
    matchPlayer: vi.fn(async () => ({ status: "not-found" }) as const),
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
  db.member.updateMany.mockResolvedValue({ count: 0 });
  clock = 1_700_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => clock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("collectStats batching", () => {
  it(`splits the roster into batches of ${STATS_BATCH_SIZE}`, async () => {
    // Derived from the constant rather than hard-coded: the size is a measured
    // figure that moves when the API's behaviour does (5 -> 3 on 2026-07-28),
    // and a literal here would fail the tuning instead of checking the split.
    const total = STATS_BATCH_SIZE * 2 + 1; // two full batches and a remainder
    db.member.findMany.mockResolvedValue(
      Array.from({ length: total }, (_, i) => member(`M${i}`, null, i)),
    );
    const provider = fakeProvider();

    await collectStats(provider);

    expect(provider.batches.map((b) => b.length)).toEqual([
      STATS_BATCH_SIZE,
      STATS_BATCH_SIZE,
      1,
    ]);
  });

  it("persists each batch as it arrives, not once at the end", async () => {
    // The old shape accumulated every row and wrote once, so a run killed at the
    // function's time limit threw away everything it had already downloaded.
    const total = STATS_BATCH_SIZE * 3;
    db.member.findMany.mockResolvedValue(
      Array.from({ length: total }, (_, i) => member(`M${i}`, null, i)),
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
  it("serves the least-recently-tried first, never alphabetical", async () => {
    // With a fixed alphabetical order the tail of a 100-member roster would be
    // dropped every single cycle.
    db.member.findMany.mockResolvedValue([
      member("Ana", "2026-07-27T12:00:00Z", 1), // tried most recently
      member("Beto", "2026-07-20T12:00:00Z", 2),
      member("Caio", null, 3), // never tried
    ]);
    const provider = fakeProvider();

    await collectStats(provider);

    expect(provider.batches[0].map((p) => p.personaId)).toEqual([
      "persona-3", // never tried sorts first
      "persona-2",
      "persona-1",
    ]);
  });

  it("orders by when we last TRIED, not by when a snapshot was written", async () => {
    // The bug this replaced, measured in production on 2026-07-28: the queue was
    // ordered by newest snapshot, and a member who is fetched fine but has not
    // played gets NO new snapshot. Their date never moved, so they stayed pinned
    // at the front and were re-fetched every run while 38 of 76 members behind
    // them were never reached — the queue advanced by ONE member in four minutes.
    //
    // Idle is exactly that member: tried a second ago, nothing new to record.
    // They must go LAST despite having no recent snapshot.
    const idle = { ...member("Idle", "2026-07-28T09:00:00Z", 1) };
    const neglected = { ...member("Neglected", "2026-07-28T08:00:00Z", 2) };
    db.member.findMany.mockResolvedValue([idle, neglected]);

    // Idle's snapshot is ancient; Neglected has none. Under the old sort Idle
    // would come first. It must not.
    db.statSnapshot.findMany.mockResolvedValue([
      {
        memberId: "id-Idle",
        kills: 1,
        deaths: 1,
        wins: 1,
        losses: 1,
        timePlayedMinutes: 1,
      },
    ]);
    const provider = fakeProvider();

    await collectStats(provider);

    expect(provider.batches[0].map((p) => p.personaId)).toEqual([
      "persona-2", // Neglected: tried longer ago
      "persona-1", // Idle: just tried, goes last
    ]);
  });

  it("does not select snapshots for ordering any more", async () => {
    // Guards the fix at the query level: reading snapshots back would invite the
    // old, broken ordering to creep in again.
    db.member.findMany.mockResolvedValue([]);
    await collectStats(fakeProvider());

    const select = db.member.findMany.mock.calls[0][0].select;
    expect(select.statsCheckedAt).toBe(true);
    expect(select.snapshots).toBeUndefined();
  });
});

describe("collectStats time budget", () => {
  it("stops before the function limit and reports what it deferred", async () => {
    // A roster far bigger than one run can hold. At 8 s a batch the 45 s budget
    // runs out partway through, and the run must return a report instead of
    // being killed mid-call.
    const total = STATS_BATCH_SIZE * 10;
    db.member.findMany.mockResolvedValue(
      Array.from({ length: total }, (_, i) => member(`M${String(i).padStart(2, "0")}`, null, i)),
    );
    const provider = fakeProvider({ costMs: 8_000 });

    const report = await collectStats(provider);

    // Six batches fit: after five the clock reads 40 s, still inside the budget,
    // so a sixth starts and lands on 48 s. The seventh check finds it spent.
    const ran = 6;
    expect(provider.batches.length).toBe(ran);
    expect(report.deferred).toBe(total - ran * STATS_BATCH_SIZE);
    // Everything it did fetch was written — the whole point of per-batch writes.
    expect(db.statSnapshot.createMany).toHaveBeenCalledTimes(ran);
    expect(report.updated).toBe(ran * STATS_BATCH_SIZE);
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

describe("collectStats sync status", () => {
  /** The status writes, as {status, ids} pairs, in call order. */
  function statusWrites() {
    return db.member.updateMany.mock.calls
      .map(([args]) => args)
      .filter((a) => a?.data?.statsStatus)
      .map((a) => ({ status: a.data.statsStatus, ids: a.where.id.in as string[] }));
  }

  it("skips members an admin paused", async () => {
    // The where clause is the contract: a paused member must never reach the API.
    db.member.findMany.mockResolvedValue([]);
    await collectStats(fakeProvider());

    const where = db.member.findMany.mock.calls[0][0].where;
    expect(where.statsPaused).toBe(false);
    expect(where.active).toBe(true);
  });

  it("records ok for members it managed to read", async () => {
    db.member.findMany.mockResolvedValue([member("Ana", null, 1), member("Beto", null, 2)]);

    await collectStats(fakeProvider());

    const ok = statusWrites().find((w) => w.status === "ok");
    expect(ok?.ids).toEqual(["id-Ana", "id-Beto"]);
  });

  it("records no_data separately from ok, in the same batch", async () => {
    // Two members, one of whom the provider has nothing for. Their statuses must
    // not be lumped together: one needs an id fix, the other needs nothing.
    db.member.findMany.mockResolvedValue([member("Ana", null, 1), member("Beto", null, 2)]);
    const provider = fakeProvider();
    provider.fetchStats = vi.fn(async (players) => {
      const map = new Map();
      map.set(players[0].personaId, rawStats(10));
      return map;
    });

    const report = await collectStats(provider);

    expect(report.noData).toBe(1);
    expect(statusWrites()).toEqual(
      expect.arrayContaining([
        { status: "ok", ids: ["id-Ana"] },
        { status: "no_data", ids: ["id-Beto"] },
      ]),
    );
  });

  it("stamps members whose identity never resolved", async () => {
    // Without this the panel cannot tell "wrong id" from "never attempted".
    db.member.findMany.mockResolvedValue([
      { ...member("SemId", null, 1), eaPersonaId: null, eaNucleusId: null },
    ]);

    const report = await collectStats(fakeProvider());

    expect(report.identityPending).toBe(1);
    expect(statusWrites()).toContainEqual({ status: "identity_pending", ids: ["id-SemId"] });
  });

  it("always moves the checked-at timestamp, including on failure", async () => {
    // "When did we last try" must answer even when the answer is "and it failed".
    db.member.findMany.mockResolvedValue([member("Ana", null, 1)]);
    const provider = fakeProvider();
    provider.fetchStats = vi.fn(async () => new Map());

    await collectStats(provider);

    const write = db.member.updateMany.mock.calls[0][0];
    expect(write.data.statsStatus).toBe("no_data");
    expect(write.data.statsCheckedAt).toBeInstanceOf(Date);
  });

  it("moves the read-at timestamp only when the read worked", async () => {
    // The two answer different questions: checkedAt is "when did we last try",
    // readAt is "how old is the data we hold". A member can be attempted every
    // cycle for hours and still carry yesterday's numbers if every attempt lands
    // in a failed batch — without readAt, nothing in the database says so.
    db.member.findMany.mockResolvedValue([member("Ana", null, 1), member("Beto", null, 2)]);
    const provider = fakeProvider();
    provider.fetchStats = vi.fn(async (players) =>
      new Map([[players[0].personaId, rawStats(10)]]),
    );

    await collectStats(provider);

    const writes = db.member.updateMany.mock.calls.map(([a]) => a);
    const ok = writes.find((w) => w.data.statsStatus === "ok");
    const failed = writes.find((w) => w.data.statsStatus === "no_data");

    expect(ok?.data.statsReadAt).toBeInstanceOf(Date);
    // Present-and-undefined would overwrite a real timestamp with null.
    expect(failed?.data).not.toHaveProperty("statsReadAt");
    expect(failed?.data.statsCheckedAt).toBeInstanceOf(Date);
  });
});

describe("collectStats batch retry", () => {
  it("retries a batch that came back completely empty", async () => {
    // An empty WHOLE batch is the signature of a failed request: a 504 loses
    // every player in it, while a successful response omits only the players
    // the source genuinely has nothing for.
    db.member.findMany.mockResolvedValue(
      Array.from({ length: STATS_BATCH_SIZE }, (_, i) => member(`M${i}`, null, i)),
    );
    const provider = fakeProvider();
    let call = 0;
    provider.fetchStats = vi.fn(async (players: PlayerIdentity[]) => {
      call += 1;
      if (call === 1) return new Map<string, RawStats>(); // the 504
      return new Map(players.map((p, i) => [p.personaId, rawStats(100 + i)]));
    });

    const report = await collectStats(provider);

    expect(provider.fetchStats).toHaveBeenCalledTimes(2);
    expect(report.retriedBatches).toBe(1);
    expect(report.recoveredByRetry).toBe(STATS_BATCH_SIZE);
    expect(report.noData).toBe(0);
  });

  it("does not retry when only some of the batch is missing", async () => {
    // One player missing from a successful response means that player has no
    // BF6 data. Retrying would spend a full round trip every cycle to be told
    // the same thing.
    db.member.findMany.mockResolvedValue(
      Array.from({ length: STATS_BATCH_SIZE }, (_, i) => member(`M${i}`, null, i)),
    );
    const provider = fakeProvider();
    provider.fetchStats = vi.fn(async (players: PlayerIdentity[]) =>
      new Map(players.slice(1).map((p, i) => [p.personaId, rawStats(100 + i)])),
    );

    const report = await collectStats(provider);

    expect(provider.fetchStats).toHaveBeenCalledTimes(1);
    expect(report.retriedBatches).toBe(0);
    expect(report.noData).toBe(1);
  });

  it("retries at most once, then gives up on the batch", async () => {
    // Bounded on purpose. The alternative — holding the member at the front of
    // the queue until they succeed — is the starvation that broke the sweep on
    // 2026-07-28: a member who always fails would block everyone behind them.
    db.member.findMany.mockResolvedValue(
      Array.from({ length: STATS_BATCH_SIZE }, (_, i) => member(`M${i}`, null, i)),
    );
    const provider = fakeProvider();
    provider.fetchStats = vi.fn(async () => new Map());

    const report = await collectStats(provider);

    expect(provider.fetchStats).toHaveBeenCalledTimes(2);
    expect(report.recoveredByRetry).toBe(0);
    expect(report.noData).toBe(STATS_BATCH_SIZE);
  });

  it("skips the retry when the budget is already spent", async () => {
    // A retry costs a full round trip. Spending it past the deadline is how a
    // run gets killed mid-write instead of returning a report.
    db.member.findMany.mockResolvedValue(
      Array.from({ length: STATS_BATCH_SIZE }, (_, i) => member(`M${i}`, null, i)),
    );
    const provider = fakeProvider();
    provider.fetchStats = vi.fn(async () => {
      clock += 50_000; // the request itself blows the 45 s budget
      return new Map();
    });

    const report = await collectStats(provider);

    expect(provider.fetchStats).toHaveBeenCalledTimes(1);
    expect(report.retriedBatches).toBe(0);
  });
});
