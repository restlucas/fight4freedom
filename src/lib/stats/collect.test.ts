import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STATS_BATCH_SIZE } from "./gametools";
import { POINT_WEIGHTS } from "./points";
import type { PlayerIdentity, RawStats, StatsProvider } from "./provider";
import { emptyTotals, type StatTotals } from "./snapshots";

/**
 * The collector talks to the database, so these tests stub `@/lib/db` rather than
 * reaching Supabase. What is worth locking here is the ORCHESTRATION, which is
 * where the bugs were: batch size, per-batch persistence, queue order and the
 * time budget. The per-player translation is covered in gametools.test.ts.
 */
const db = {
  member: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  memberTopItem: { upsert: vi.fn() },
  statSnapshot: { findMany: vi.fn(), createMany: vi.fn() },
  clanEvent: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
};
vi.mock("@/lib/db", () => ({ db }));

const {
  collectStats,
  IDENTITY_PHASE_SHARE,
  ROUTE_BUDGET_MS,
  ROUTE_IDENTITY_LIMIT,
  WORKER_BUDGET_MS,
  WORKER_IDENTITY_LIMIT,
  WORKER_PROFILE_LIMIT,
  WORKER_ROUNDS,
} = await import("./collect");

/**
 * A member row shaped like the collector's select. `checkedAt` is when the
 * collector last TRIED them, which is what orders the queue.
 */
function member(nickname: string, checkedAt: string | null, index: number) {
  return {
    id: `id-${nickname}`,
    nickname,
    // Balance before the run, so a rank crossing is detectable. Mid-ladder by
    // default, so a normal credit does not accidentally promote anyone.
    rankPoints: 10_000,
    platformId: nickname,
    eaPersonaId: `persona-${index}`,
    eaNucleusId: `nucleus-${index}`,
    statsCheckedAt: checkedAt ? new Date(checkedAt) : null,
    // A read that WORKED at some point. Defaulted to a real instant so only the
    // tests that mean "never once" have to say so — that is the distinction
    // `neverRead` is built on.
    statsReadAt: new Date("2026-07-28T09:00:00Z"),
    // Never had their GAME profile read. The profile pass has its own queue, on its
    // own clock, because it is capped per cycle instead of swept.
    gameProfileReadAt: null as Date | null,
  };
}

/** Members with nothing bound yet, so a run spends itself on identity searches. */
function pendingMembers(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    ...member(`P${String(i).padStart(2, "0")}`, null, i),
    eaPersonaId: null,
    eaNucleusId: null,
  }));
}

/**
 * How many searches the clock guard allows at a given cost per search.
 *
 * The `+ 1` is the guard's semantics, not a rounding fudge: it checks the clock
 * BEFORE each search, so the one that starts on the boundary is allowed to run and
 * overrun it. Bounding the in-flight request instead would mean cancelling a
 * lookup that is already paid for.
 */
function searchesWithin(budgetMs: number, costMs: number) {
  return Math.floor((budgetMs * IDENTITY_PHASE_SHARE) / costMs) + 1;
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
    xpTotal: 1_000,
    xpPerformance: 400,
    xpAccolades: 100,
    // Empty by default: the top-item write has its own suite below, and every other
    // test here is about orchestration.
    topItems: [],
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
    // Part of the interface, and deliberately never called from a collection run:
    // the identity card belongs to the interactive screen. A stub that throws
    // would say that louder, but the collector must not depend on it at all, and
    // returning null is what an unread account looks like.
    fetchIdentityCard: vi.fn(async () => null),
    // The game-profile pass runs at the END of a cycle and is cosmetic, so the
    // default answer here is "the source told us nothing" — the case that must
    // leave every rank already stored untouched.
    fetchGameProfile: vi.fn(async () => null),
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
  db.memberTopItem.upsert.mockResolvedValue({});
  db.clanEvent.findMany.mockResolvedValue([]);
  db.clanEvent.create.mockResolvedValue({});
  db.clanEvent.update.mockResolvedValue({});
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

    expect(provider.batches.map((b) => b.length)).toEqual([STATS_BATCH_SIZE, STATS_BATCH_SIZE, 1]);
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

describe("collectStats neverRead", () => {
  it("names members who have NEVER been read, separately from the noData count", async () => {
    // The signal that was missing until 2026-07-28. Four members had been failing
    // every cycle since registration, indistinguishable inside `noData` from
    // members whose batch merely 504'd that round — so nobody investigated, and
    // the cause turned out to be one an admin can fix in a minute: `eaName` bound
    // to a coincidentally-named EA account with no BF6 data.
    const semLeitura = { ...member("NuncaLido", "2026-07-28T08:00:00Z", 1), statsReadAt: null };
    const comLeitura = member("JaLido", "2026-07-28T08:00:00Z", 2);
    db.member.findMany.mockResolvedValue([semLeitura, comLeitura]);
    const provider = fakeProvider();
    // A response that DID come back, with neither member in it — the shape of an
    // empty profile, not of a dead request (which would return an empty Map and
    // go to a retry round instead).
    provider.fetchStats = vi.fn(async () => new Map([["persona-outro", rawStats(1)]]));

    const report = await collectStats(provider);

    expect(report.noData).toBe(2);
    // Only the one that never worked. The other is a bad round and needs nobody.
    expect(report.neverRead).toEqual(["NuncaLido"]);
  });

  it("stays empty when every member has been read at some point", async () => {
    db.member.findMany.mockResolvedValue([member("Ana", null, 1)]);
    const provider = fakeProvider();
    provider.fetchStats = vi.fn(async () => new Map());

    const report = await collectStats(provider);

    expect(report.noData).toBe(1);
    expect(report.neverRead).toEqual([]);
  });

  it("catches a never-read member whose batch died in every round too", async () => {
    // Same member, other path: the request never came back at all, so they fall
    // out of the last retry round instead of out of a batch response. Both paths
    // have to report them, or the signal depends on how the failure happened.
    const semLeitura = { ...member("NuncaLido", null, 1), statsReadAt: null };
    db.member.findMany.mockResolvedValue([semLeitura]);
    const provider = fakeProvider();
    provider.fetchStats = vi.fn(async () => new Map());

    const report = await collectStats(provider);

    expect(report.neverRead).toEqual(["NuncaLido"]);
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

  it("does NOT stamp pending members the per-run cap never searched", async () => {
    // The bug this pins, measured in production over 21 consecutive ticks with
    // identitiesResolved = 0 every time: stamping all pending members gave them
    // an identical checked-at, the queue sort fell through to its alphabetical
    // tiebreak, and the same first ten names were searched forever while the
    // rest were never looked up once.
    const total = ROUTE_IDENTITY_LIMIT + 4;
    const pendentes = pendingMembers(total);
    db.member.findMany.mockResolvedValue(pendentes);

    const report = await collectStats(fakeProvider());

    expect(report.identityPending).toBe(total);
    const stamped = statusWrites().find((w) => w.status === "identity_pending");
    // Exactly the ones the run searched, so the remainder keep the older
    // timestamp that puts them first next time.
    expect(stamped?.ids).toHaveLength(ROUTE_IDENTITY_LIMIT);
    expect(stamped?.ids).not.toContain(`id-P${String(total - 1).padStart(2, "0")}`);
  });

  it("searches more identities on the worker profile than on the route", async () => {
    // The single cap of 10 was calibrated against the 45 s Vercel function. Left
    // on the worker it made a newly registered member wait up to three cycles to
    // be looked up, which at the 20-minute cadence is an hour.
    db.member.findMany.mockResolvedValue(pendingMembers(WORKER_IDENTITY_LIMIT + 3));
    const provider = fakeProvider();

    await collectStats(provider, {
      budgetMs: WORKER_BUDGET_MS,
      rounds: WORKER_ROUNDS,
      identityLimit: WORKER_IDENTITY_LIMIT,
    });

    expect(provider.searchPlayer).toHaveBeenCalledTimes(WORKER_IDENTITY_LIMIT);
  });

  it("stops searching identities once the phase's share of the budget is gone", async () => {
    // The cap is a count, not a time bound. SEARCH_TIMEOUT_MS is 10 s, so a
    // degraded source turns 25 searches into 250 s of a 480 s budget and the
    // SWEEP is what gets cut — the one part of the run that produces stats.
    db.member.findMany.mockResolvedValue(pendingMembers(WORKER_IDENTITY_LIMIT));
    const provider = fakeProvider();
    // Worst case per search: the provider's own timeout.
    provider.searchPlayer = vi.fn(async () => {
      clock += 10_000;
      return null;
    });

    await collectStats(provider, {
      budgetMs: WORKER_BUDGET_MS,
      rounds: WORKER_ROUNDS,
      identityLimit: WORKER_IDENTITY_LIMIT,
    });

    const allowed = searchesWithin(WORKER_BUDGET_MS, 10_000);
    expect(allowed).toBeLessThan(WORKER_IDENTITY_LIMIT);
    expect(provider.searchPlayer).toHaveBeenCalledTimes(allowed);
    // And the ones it never reached stay unstamped, so they lead the next queue.
    const stamped = statusWrites().find((w) => w.status === "identity_pending");
    expect(stamped?.ids).toHaveLength(allowed);
  });

  it("leaves the clock guard dormant on a healthy run", async () => {
    // 25 searches at the measured 2,4 s is 60 s, well inside the 120 s the share
    // allows on the worker: the cap binds when the source is fine, the clock only
    // when it is not.
    db.member.findMany.mockResolvedValue(pendingMembers(WORKER_IDENTITY_LIMIT));
    const provider = fakeProvider();
    provider.searchPlayer = vi.fn(async () => {
      clock += 2_400;
      return null;
    });

    await collectStats(provider, {
      budgetMs: WORKER_BUDGET_MS,
      rounds: WORKER_ROUNDS,
      identityLimit: WORKER_IDENTITY_LIMIT,
    });

    expect(provider.searchPlayer).toHaveBeenCalledTimes(WORKER_IDENTITY_LIMIT);
  });

  it("applies the share to the route budget too, not just the worker's", async () => {
    db.member.findMany.mockResolvedValue(pendingMembers(ROUTE_IDENTITY_LIMIT));
    const provider = fakeProvider();
    provider.searchPlayer = vi.fn(async () => {
      clock += 10_000;
      return null;
    });

    await collectStats(provider);

    // 45 s * 0,25 = 11,25 s, so the third search never starts.
    expect(provider.searchPlayer).toHaveBeenCalledTimes(searchesWithin(ROUTE_BUDGET_MS, 10_000));
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
    provider.fetchStats = vi.fn(async (players) => new Map([[players[0].personaId, rawStats(10)]]));

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
    provider.fetchStats = vi.fn(
      async (players: PlayerIdentity[]) =>
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

  it("retries in ROUNDS, and the last one asks a single player per request", async () => {
    // The reason the worker profile ends in a 1: by the third pass the pool is
    // tiny, so it can afford to isolate whoever is actually timing out instead of
    // letting them take two healthy members down with them for a third time.
    db.member.findMany.mockResolvedValue(
      Array.from({ length: STATS_BATCH_SIZE }, (_, i) => member(`M${i}`, null, i)),
    );
    const provider = fakeProvider();
    let round = 0;
    provider.fetchStats = vi.fn(async (players: PlayerIdentity[]) => {
      provider.batches.push(players);
      round += 1;
      // Both grouped passes die; only the one-at-a-time pass gets through.
      if (round <= 2) return new Map<string, RawStats>();
      return new Map(players.map((p, i) => [p.personaId, rawStats(100 + i)]));
    });

    const report = await collectStats(provider, {
      budgetMs: WORKER_BUDGET_MS,
      rounds: WORKER_ROUNDS,
    });

    expect(provider.batches.map((b) => b.length)).toEqual([
      STATS_BATCH_SIZE, // round 1
      STATS_BATCH_SIZE, // round 2
      1, // round 3, one request per member
      1,
      1,
    ]);
    expect(report.roundsRun).toBe(3);
    expect(report.noData).toBe(0);
    expect(report.updated).toBe(STATS_BATCH_SIZE);
  });

  it("never reports a member a later round rescued as no-data", async () => {
    // The whole point of deferring the status write: a member whose first request
    // died and whose second worked must appear once, as a success. Stamping
    // `no_data` per batch (the old shape) would have written the failure first and
    // left the panel showing a broken sync for a member who is fine.
    db.member.findMany.mockResolvedValue(
      Array.from({ length: STATS_BATCH_SIZE }, (_, i) => member(`M${i}`, null, i)),
    );
    const provider = fakeProvider();
    let call = 0;
    provider.fetchStats = vi.fn(async (players: PlayerIdentity[]) => {
      call += 1;
      if (call === 1) return new Map<string, RawStats>();
      return new Map(players.map((p, i) => [p.personaId, rawStats(100 + i)]));
    });

    const report = await collectStats(provider);

    expect(report.members.map((m) => m.outcome)).not.toContain("no-data");
    const statuses = db.member.updateMany.mock.calls
      .map(([a]) => a?.data?.statsStatus)
      .filter(Boolean);
    expect(statuses).not.toContain("no_data");
  });

  it("reports a single round when the first pass reads everyone", async () => {
    db.member.findMany.mockResolvedValue(
      Array.from({ length: STATS_BATCH_SIZE * 2 }, (_, i) => member(`M${i}`, null, i)),
    );

    const report = await collectStats(fakeProvider());

    expect(report.roundsRun).toBe(1);
    expect(report.retriedBatches).toBe(0);
  });

  it("counts a member a RETRY round could not reach as no-data, not deferred", async () => {
    // The distinction the queue depends on. `deferred` means "never asked about",
    // and those members are left unstamped so their older `statsCheckedAt` floats
    // them to the front next cycle. A member already asked once, whose request
    // died, is a reading we owe — recording that as `deferred` would claim we
    // never tried and would hide a real failure from the panel.
    const total = STATS_BATCH_SIZE * 2;
    db.member.findMany.mockResolvedValue(
      Array.from({ length: total }, (_, i) => member(`M${i}`, null, i)),
    );
    const provider = fakeProvider();
    provider.fetchStats = vi.fn(async () => {
      clock += 20_000; // two batches fit the 45 s budget, the third does not
      return new Map<string, RawStats>();
    });

    const report = await collectStats(provider);

    // Both batches of round 1, then one batch of round 2 before the clock is up.
    expect(provider.fetchStats).toHaveBeenCalledTimes(3);
    expect(report.roundsRun).toBe(2);
    expect(report.deferred).toBe(0);
    expect(report.noData).toBe(total);
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

describe("collectStats career points", () => {
  /** A previous snapshot row, shaped like the collector's select. */
  function previousRow(memberId: string, partial: Partial<StatTotals>, nucleus: string | null) {
    return { memberId, eaNucleusId: nucleus, ...emptyTotals(), ...partial };
  }

  /** Credits recorded through `member.update`, which is where `increment` lands. */
  function credits() {
    return db.member.update.mock.calls
      .map(([args]) => args)
      .filter((a) => a?.data?.rankPoints?.increment !== undefined)
      .map((a) => ({ id: a.where.id as string, points: a.data.rankPoints.increment as number }));
  }

  it("credits the progress since the previous snapshot", () => {
    // Expected value spelled out from POINT_WEIGHTS rather than by calling the
    // accrual again, so this fails if the WIRING is wrong (wrong base row, wrong
    // member) and also if the weights move without the ladder being revisited.
    const delta: Partial<StatTotals> = {
      kills: 50,
      deaths: 1,
      wins: 1,
      losses: 1,
      assists: 1,
      revives: 1,
      headshots: 1,
      objectivesCaptured: 1,
      objectivesDefended: 1,
      objectiveTimeSeconds: 1,
      spots: 1,
      healthRestored: 1,
      timePlayedMinutes: 1,
    };
    let expected = 0;
    for (const [key, value] of Object.entries(delta)) {
      expected += value * POINT_WEIGHTS[key as keyof StatTotals];
    }

    db.member.findMany.mockResolvedValue([member("Ana", null, 1)]);
    // rawStats(100) minus this row is exactly `delta` above.
    db.statSnapshot.findMany.mockResolvedValue([previousRow("id-Ana", { kills: 50 }, "nucleus-1")]);
    const provider = fakeProvider();
    provider.fetchStats = vi.fn(
      async (players) => new Map([[players[0].personaId, rawStats(100)]]),
    );

    return collectStats(provider).then((report) => {
      expect(credits()).toEqual([{ id: "id-Ana", points: Math.round(expected) }]);
      expect(report.pointsAccrued).toBe(Math.round(expected));
    });
  });

  it("credits nothing on a first reading, however large the totals", async () => {
    // No previous row: these are lifetime counters earned before we watched, and
    // the balance imported from the v1 site already stands for them. Crediting
    // here would promote a new member to General for signing up.
    db.member.findMany.mockResolvedValue([member("Ana", null, 1)]);
    db.statSnapshot.findMany.mockResolvedValue([]);
    const provider = fakeProvider();
    provider.fetchStats = vi.fn(
      async (players) => new Map([[players[0].personaId, rawStats(40_000)]]),
    );

    const report = await collectStats(provider);

    expect(credits()).toEqual([]);
    expect(report.pointsAccrued).toBe(0);
  });

  it("credits nothing to a member who was read but did not play", async () => {
    // Same counters as the previous snapshot: no row is written, so no points.
    // This is what makes the accrual safe against re-reads — it is tied to the
    // insert, not to the fetch.
    db.member.findMany.mockResolvedValue([member("Ana", null, 1)]);
    const same = rawStats(100);
    db.statSnapshot.findMany.mockResolvedValue([previousRow("id-Ana", { ...same }, "nucleus-1")]);
    const provider = fakeProvider();
    provider.fetchStats = vi.fn(async (players) => new Map([[players[0].personaId, same]]));

    const report = await collectStats(provider);

    expect(report.unchanged).toBe(1);
    expect(credits()).toEqual([]);
    expect(report.pointsAccrued).toBe(0);
  });

  it("credits nothing across a rebind", async () => {
    // The previous snapshot belongs to another EA account, so the difference is a
    // stranger's career. Measured for real on 2026-07-28: 86.914 points for a
    // member whose actual activity was 301 minutes.
    db.member.findMany.mockResolvedValue([member("Ana", null, 1)]);
    db.statSnapshot.findMany.mockResolvedValue([
      previousRow("id-Ana", { kills: 10 }, "outra-conta"),
    ]);
    const provider = fakeProvider();
    provider.fetchStats = vi.fn(
      async (players) => new Map([[players[0].personaId, rawStats(40_000)]]),
    );

    const report = await collectStats(provider);

    expect(credits()).toEqual([]);
    expect(report.pointsAccrued).toBe(0);
    // The snapshot itself is still written: the reading is valid, only the
    // comparison with the old account is not.
    expect(report.updated).toBe(1);
  });

  it("records the credit as an activity event, after the balance is written", async () => {
    // Order matters: a promotion row that outlived a failed credit would announce
    // something that did not happen.
    db.member.findMany.mockResolvedValue([member("Ana", null, 1)]);
    db.statSnapshot.findMany.mockResolvedValue([
      previousRow("id-Ana", { kills: 50, timePlayedMinutes: 100 }, "nucleus-1"),
    ]);
    const provider = fakeProvider();
    provider.fetchStats = vi.fn(
      async (players) =>
        new Map([[players[0].personaId, { ...rawStats(100), timePlayedMinutes: 145 }]]),
    );

    await collectStats(provider);

    expect(db.clanEvent.create).toHaveBeenCalledTimes(1);
    const event = db.clanEvent.create.mock.calls[0][0].data;
    expect(event).toMatchObject({ memberId: "id-Ana", kind: "session" });
    // Minutes come from the difference between readings, not the lifetime total.
    expect(event.minutesPlayed).toBe(45);
  });

  it("records no event for a member who was read but did not play", async () => {
    db.member.findMany.mockResolvedValue([member("Ana", null, 1)]);
    const same = rawStats(100);
    db.statSnapshot.findMany.mockResolvedValue([previousRow("id-Ana", { ...same }, "nucleus-1")]);
    const provider = fakeProvider();
    provider.fetchStats = vi.fn(async (players) => new Map([[players[0].personaId, same]]));

    await collectStats(provider);

    expect(db.clanEvent.create).not.toHaveBeenCalled();
    expect(db.clanEvent.findMany).not.toHaveBeenCalled();
  });

  it("uses increment, never a computed total", async () => {
    // A read-modify-write would drop a credit whenever the manual route runs
    // while the worker is mid cycle.
    db.member.findMany.mockResolvedValue([member("Ana", null, 1)]);
    db.statSnapshot.findMany.mockResolvedValue([previousRow("id-Ana", { kills: 50 }, "nucleus-1")]);
    const provider = fakeProvider();
    provider.fetchStats = vi.fn(
      async (players) => new Map([[players[0].personaId, rawStats(100)]]),
    );

    await collectStats(provider);

    const write = db.member.update.mock.calls[0][0];
    expect(write.data.rankPoints).toHaveProperty("increment");
    expect(typeof write.data.rankPoints.increment).toBe("number");
  });
});

describe("collectStats game profile pass", () => {
  /** Only the `member.update` calls the profile pass makes. */
  function profileWrites() {
    return db.member.update.mock.calls
      .map((call) => call[0])
      .filter((arg) => arg.data.gameProfileReadAt !== undefined);
  }

  const GAME_PROFILE = {
    rankName: "Second Lieutenant V",
    rankLevel: 141,
    rankImageUrl: "https://cdn.gametools.network/ranks/bf6/t_ui_rank_140_sm.png",
    badges: 104,
    dogTags: 39,
    competitive: null,
  };

  it("reads at most `profileLimit` members per cycle", async () => {
    // A cap and not a sweep: this costs ONE request per member against a free
    // community API, to refresh a value that moves every few dozen hours of play.
    db.member.findMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => member(`M${i}`, "2026-07-28T10:00:00Z", i)),
    );
    const provider = fakeProvider();
    provider.fetchGameProfile = vi.fn(async () => GAME_PROFILE);

    const report = await collectStats(provider, { profileLimit: 4 });

    expect(provider.fetchGameProfile).toHaveBeenCalledTimes(4);
    expect(report.gameProfilesRead).toBe(4);
  });

  it("takes the least-recently-read first, never-read ahead of everyone", async () => {
    db.member.findMany.mockResolvedValue([
      {
        ...member("Fresh", "2026-07-28T10:00:00Z", 0),
        gameProfileReadAt: new Date("2026-07-29T12:00:00Z"),
      },
      {
        ...member("Stale", "2026-07-28T10:00:00Z", 1),
        gameProfileReadAt: new Date("2026-07-20T12:00:00Z"),
      },
      { ...member("Never", "2026-07-28T10:00:00Z", 2), gameProfileReadAt: null },
    ]);
    const provider = fakeProvider();
    provider.fetchGameProfile = vi.fn(async () => GAME_PROFILE);

    await collectStats(provider, { profileLimit: 2 });

    // Never-read sorts first (null reads as 0), then the oldest timestamp.
    expect(provider.fetchGameProfile).toHaveBeenCalledTimes(2);
    const asked = vi
      .mocked(provider.fetchGameProfile)
      .mock.calls.map(([identity]) => identity.personaId);
    expect(asked).toEqual(["persona-2", "persona-1"]);
  });

  it("stamps the attempt even when the source answers nothing, so the queue rotates", async () => {
    // THE REGRESSION THIS PASS EXISTS TO AVOID. Stamping only on success leaves a
    // member whose profile always fails holding the oldest timestamp forever, and
    // they get re-picked every cycle while everyone behind them starves. That exact
    // shape froze identity resolution for 21 consecutive cycles on 2026-07-28.
    db.member.findMany.mockResolvedValue([member("Broken", "2026-07-28T10:00:00Z", 0)]);
    const provider = fakeProvider();
    provider.fetchGameProfile = vi.fn(async () => null);

    const report = await collectStats(provider, { profileLimit: 1 });

    const writes = profileWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0].data.gameProfileReadAt).toBeInstanceOf(Date);
    // Nothing was learned, so nothing about the rank is written: `fetchGameProfile`
    // cannot tell "the request died" from "this account has no rank", so writing
    // its nulls would erase a good rank on a bad afternoon.
    expect(writes[0].data).not.toHaveProperty("gameRankName");
    expect(writes[0].data).not.toHaveProperty("badgeCount");
    expect(report.gameProfilesRead).toBe(0);
  });

  it("stores the whole profile when the source answers", async () => {
    db.member.findMany.mockResolvedValue([member("Ok", "2026-07-28T10:00:00Z", 0)]);
    const provider = fakeProvider();
    provider.fetchGameProfile = vi.fn(async () => ({
      ...GAME_PROFILE,
      competitive: { mode: "Redsec Duos", rankName: "Ouro III" },
    }));

    await collectStats(provider, { profileLimit: 1 });

    const write = profileWrites()[0];
    expect(write.data.gameRankName).toBe("Second Lieutenant V");
    expect(write.data.gameRankLevel).toBe(141);
    expect(write.data.badgeCount).toBe(104);
    expect(write.data.dogTagCount).toBe(39);
    expect(write.data.competitiveRankName).toBe("Ouro III");
    expect(write.data.competitiveRankMode).toBe("Redsec Duos");
  });

  it("clears a division that is gone, rather than leaving a stale one", async () => {
    // A successful read is authoritative: the member dropped out of ranked, so the
    // tile has to go. Only a FAILED read leaves the old value alone.
    db.member.findMany.mockResolvedValue([member("Ok", "2026-07-28T10:00:00Z", 0)]);
    const provider = fakeProvider();
    provider.fetchGameProfile = vi.fn(async () => GAME_PROFILE);

    await collectStats(provider, { profileLimit: 1 });

    expect(profileWrites()[0].data.competitiveRankName).toBeNull();
  });

  it("never lets a thrown profile call cost the cycle's stats", async () => {
    // The snapshots are already written by the time this runs. A cosmetic refresh
    // must not be able to fail a cycle whose product already landed.
    db.member.findMany.mockResolvedValue([member("Boom", "2026-07-28T10:00:00Z", 0)]);
    const provider = fakeProvider();
    provider.fetchGameProfile = vi.fn(async () => {
      throw new Error("504");
    });

    const report = await collectStats(provider, { profileLimit: 1 });

    expect(report.updated).toBe(1);
    expect(report.gameProfilesRead).toBe(0);
    // Still stamped: a member who always throws must not hold the front of the queue.
    expect(profileWrites()[0].data.gameProfileReadAt).toBeInstanceOf(Date);
  });

  it("does not run at all when the limit is zero", async () => {
    db.member.findMany.mockResolvedValue([member("Ok", "2026-07-28T10:00:00Z", 0)]);
    const provider = fakeProvider();
    provider.fetchGameProfile = vi.fn(async () => GAME_PROFILE);

    await collectStats(provider, { profileLimit: 0 });

    expect(provider.fetchGameProfile).not.toHaveBeenCalled();
  });

  it("skips the pass when the sweep already spent the budget", async () => {
    // The profile is cosmetic and the snapshot is the product, so on a slow cycle
    // the right outcome is every member's stats read and nobody's badges refreshed.
    db.member.findMany.mockResolvedValue([
      member("A", "2026-07-28T10:00:00Z", 0),
      member("B", "2026-07-28T10:00:00Z", 1),
    ]);
    // Each batch burns the whole budget, so the deadline is long past by the time
    // the pass starts.
    const provider = fakeProvider({ costMs: WORKER_BUDGET_MS });
    provider.fetchGameProfile = vi.fn(async () => GAME_PROFILE);

    const report = await collectStats(provider, {
      budgetMs: WORKER_BUDGET_MS,
      rounds: WORKER_ROUNDS,
      profileLimit: WORKER_PROFILE_LIMIT,
    });

    expect(provider.fetchGameProfile).not.toHaveBeenCalled();
    expect(report.gameProfilesRead).toBe(0);
  });

  it("skips members with no EA identity bound", async () => {
    // Nothing to ask the source about: the profile endpoint is keyed by persona id.
    db.member.findMany.mockResolvedValue(pendingMembers(3));
    const provider = fakeProvider();
    provider.fetchGameProfile = vi.fn(async () => GAME_PROFILE);

    await collectStats(provider, { profileLimit: 3 });

    expect(provider.fetchGameProfile).not.toHaveBeenCalled();
  });
});

describe("collectStats top items", () => {
  const weapon = {
    kind: "weapon" as const,
    itemId: "wp_mg_l110",
    name: "L110",
    group: "Machine Guns",
    imageUrl: "https://cdn.gametools.network/weapons/bf6/L110.webp",
    kills: 3_412,
    matches: 0,
    wins: 0,
    losses: 0,
    secondsUsed: 21_500,
    metrics: { accuracy: 21.91, headshotKills: 502 },
  };
  const map = {
    kind: "map" as const,
    itemId: "lvlmpabbasid",
    name: "Siege of Cairo",
    group: null,
    imageUrl: "https://cdn.gametools.network/maps/bf6/Abbasid.webp",
    kills: 0,
    matches: 86,
    wins: 50,
    losses: 36,
    secondsUsed: 113_310,
    metrics: null,
  };

  /** A provider whose reads carry the given top items. */
  function providerWith(topItems: RawStats["topItems"]) {
    const provider = fakeProvider();
    provider.fetchStats = vi.fn(
      async (players: PlayerIdentity[]) =>
        new Map(players.map((p) => [p.personaId, { ...rawStats(100), topItems }])),
    );
    return provider;
  }

  it("upserts one row per kind, keyed so the table cannot grow", async () => {
    // The row means "this member's best weapon", so the item inside it changes when
    // their favourite does. That is what bounds the table at three rows per member.
    db.member.findMany.mockResolvedValue([member("Solo", null, 0)]);

    await collectStats(providerWith([weapon, map]));

    expect(db.memberTopItem.upsert).toHaveBeenCalledTimes(2);
    const [first] = db.memberTopItem.upsert.mock.calls[0];
    expect(first.where).toEqual({ memberId_kind: { memberId: "id-Solo", kind: "weapon" } });
    expect(first.create.name).toBe("L110");
    expect(first.update.name).toBe("L110");
    // Stamped so a rebind can discard the previous account's items in one delete.
    expect(first.create.eaNucleusId).toBe("nucleus-0");
  });

  it("carries the per-kind extras into metrics", async () => {
    db.member.findMany.mockResolvedValue([member("Solo", null, 0)]);

    await collectStats(providerWith([weapon]));

    expect(db.memberTopItem.upsert.mock.calls[0][0].create.metrics).toEqual({
      accuracy: 21.91,
      headshotKills: 502,
    });
  });

  it("leaves a kind alone when the payload did not answer for it", async () => {
    // The source occasionally serves a partially zeroed payload, so an absent list
    // must not delete a weapon we already knew about.
    db.member.findMany.mockResolvedValue([member("Solo", null, 0)]);

    await collectStats(providerWith([map]));

    const kinds = db.memberTopItem.upsert.mock.calls.map(
      (call) => call[0].where.memberId_kind.kind,
    );
    expect(kinds).toEqual(["map"]);
  });

  it("writes nothing for a member the source did not return", async () => {
    db.member.findMany.mockResolvedValue([member("Solo", null, 0)]);
    const provider = fakeProvider();
    provider.fetchStats = vi.fn(async () => new Map());

    await collectStats(provider);

    expect(db.memberTopItem.upsert).not.toHaveBeenCalled();
  });

  it("never lets a failed item write cost the cycle's snapshots", async () => {
    // Three rows are a panel; the snapshot is the product, and it is already written
    // by the time this runs.
    db.member.findMany.mockResolvedValue([member("Solo", null, 0)]);
    db.memberTopItem.upsert.mockRejectedValue(new Error("constraint"));

    const report = await collectStats(providerWith([weapon]));

    expect(report.updated).toBe(1);
    expect(db.statSnapshot.createMany).toHaveBeenCalled();
  });
});
