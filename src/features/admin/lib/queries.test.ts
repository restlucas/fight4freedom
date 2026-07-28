import { describe, expect, it, vi } from "vitest";

/**
 * `getAdminMembers` is mostly plumbing, but one rule inside it is a judgement
 * call worth pinning: how a failed attempt is presented depends on whether the
 * member has stats from before. Getting that wrong is what made the panel
 * report 29 broken members when 24 of them were fine.
 */
const db = { member: { findMany: vi.fn() } };
vi.mock("@/lib/db", () => ({ db }));

const { getAdminMembers } = await import("./queries");

/** A row shaped like the query's select, healthy unless overridden. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    nickname: "Panzer",
    platform: "ea",
    platformId: "Panzer",
    eaPersonaId: "persona-1",
    eaNucleusId: "nucleus-1",
    role: "member",
    active: true,
    avatarUrl: null,
    discordId: "discord-1",
    collectWithoutLogin: false,
    statsPaused: false,
    statsStatus: "ok",
    statsCheckedAt: new Date("2026-07-28T12:00:00Z"),
    _count: { snapshots: 3 },
    profiles: [],
    medals: [],
    invites: [],
    ...overrides,
  };
}

async function syncOf(overrides: Record<string, unknown> = {}) {
  db.member.findMany.mockResolvedValue([row(overrides)]);
  const [member] = await getAdminMembers();
  return member.sync;
}

describe("a failed attempt", () => {
  it("reads as syncing-with-a-caveat when the member already has stats", async () => {
    // Measured 2026-07-28: 24 of 29 members marked no_data had earlier
    // snapshots. The source 504s on about half the batches and the whole batch
    // comes back empty — that is a bad round, not a broken member.
    const sync = await syncOf({ statsStatus: "no_data", _count: { snapshots: 4 } });

    expect(sync.state).toBe("ok");
    expect(sync.lastAttemptFailed).toBe(true);
  });

  it("reads as no_data only when no attempt ever worked", async () => {
    const sync = await syncOf({ statsStatus: "no_data", _count: { snapshots: 0 } });

    expect(sync.state).toBe("no_data");
    // Nothing to caveat: the badge itself already says the collection failed.
    expect(sync.lastAttemptFailed).toBe(false);
  });

  it("carries no caveat when the last round actually worked", async () => {
    const sync = await syncOf({ statsStatus: "ok" });

    expect(sync.state).toBe("ok");
    expect(sync.lastAttemptFailed).toBe(false);
  });
});

describe("states that outrank the last outcome", () => {
  it("keeps a paused member paused even with history and a failed round", async () => {
    // An admin's explicit choice must not be repainted as "syncing".
    const sync = await syncOf({ statsPaused: true, statsStatus: "no_data" });

    expect(sync.state).toBe("paused");
    expect(sync.lastAttemptFailed).toBe(false);
  });

  it("keeps an ineligible member out of the collection", async () => {
    const sync = await syncOf({
      discordId: null,
      collectWithoutLogin: false,
      statsStatus: "no_data",
    });

    expect(sync.state).toBe("off");
    expect(sync.canPause).toBe(false);
  });

  it("flags a member whose platform id matches no EA account", async () => {
    const sync = await syncOf({ statsStatus: "identity_pending", eaPersonaId: null });
    expect(sync.state).toBe("identity_pending");
  });

  it("waits on a member the collector has not reached yet", async () => {
    const sync = await syncOf({ statsStatus: null, statsCheckedAt: null });
    expect(sync.state).toBe("waiting");
    expect(sync.checkedAt).toBeNull();
  });
});
