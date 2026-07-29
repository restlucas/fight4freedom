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
const { SYNC_STATES_BY_URGENCY, syncUrgency } = await import("./member-sync");

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
    statsPausedReason: null,
    // Null = this member never asked for help. Non-null outranks every other
    // state, so a fixture missing it would silently report "help_requested" for
    // every case below.
    identityHelpRequestedAt: null,
    statsStatus: "ok",
    statsCheckedAt: new Date("2026-07-28T12:00:00Z"),
    // A read that WORKED. Null here is what separates "never once" from "not this
    // round", so the healthy fixture has to carry a real one.
    statsReadAt: new Date("2026-07-28T12:00:00Z"),
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

  it("reads as never_read when NO attempt ever worked", async () => {
    // The case that was invisible until 2026-07-28. Four members had been failing
    // every cycle since registration and wore the same badge as a member whose
    // batch 504'd once — so the roster looked healthier than it was. Investigating
    // them found one cause for all four: `eaName` bound to a coincidentally-named
    // EA account with no BF6 data. One was fixed by the name alone.
    const sync = await syncOf({
      statsStatus: "no_data",
      _count: { snapshots: 0 },
      statsReadAt: null,
    });

    expect(sync.state).toBe("never_read");
    expect(sync.readAt).toBeNull();
    // Nothing to caveat: the badge itself already says the collection never worked.
    expect(sync.lastAttemptFailed).toBe(false);
  });

  it("reads as no_data when a read DID work before but the recent ones fail", async () => {
    // The middle case, and why `no_data` survives: read once, no snapshot yet
    // (the member had not played), failing now. Not a wrong binding — the copy
    // must not send an admin hunting an id.
    const sync = await syncOf({
      statsStatus: "no_data",
      _count: { snapshots: 0 },
      statsReadAt: new Date("2026-07-28T09:00:00Z"),
    });

    expect(sync.state).toBe("no_data");
  });

  it("never_read outranks every other DIAGNOSED state in the column sort", async () => {
    // It is the only diagnosed state that cannot resolve on its own AND whose fix
    // is known, so it has to sort above "ID não encontrado".
    //
    // "Diagnosed" became the right word on 2026-07-29, when `help_requested` took
    // the top slot: that one is a member explicitly asking, which outranks anything
    // the system merely inferred. Asserted by filtering rather than by index so
    // this keeps testing the rule instead of a position.
    const diagnosed = SYNC_STATES_BY_URGENCY.filter((state) => state !== "help_requested");
    expect(diagnosed[0]).toBe("never_read");
    expect(syncUrgency("never_read")).toBeLessThan(syncUrgency("identity_pending"));
    expect(syncUrgency("never_read")).toBeLessThan(syncUrgency("no_data"));
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

describe("a member who asked for help identifying their EA account", () => {
  it("outranks every state the system diagnosed on its own", async () => {
    // The combination that made the ordering necessary: asking for help is what
    // PAUSES a member with nothing bound, so checking statsPaused first would
    // relabel the whole queue as routine admin pauses and hide it.
    const sync = await syncOf({
      identityHelpRequestedAt: new Date("2026-07-29T18:00:00Z"),
      statsPaused: true,
      statsPausedReason: "O membro não conseguiu identificar a própria conta da EA",
      statsStatus: "no_data",
      statsReadAt: null,
      _count: { snapshots: 0 },
    });

    expect(sync.state).toBe("help_requested");
    expect(sync.helpRequestedAt).toBe("2026-07-29T18:00:00.000Z");
    expect(sync.pausedReason).toBe("O membro não conseguiu identificar a própria conta da EA");
  });

  it("still reads as out-of-collection when the member is inactive", async () => {
    // Eligibility comes first: a request cannot pull an inactive member back into
    // a collection that is not looking at them anyway.
    const sync = await syncOf({
      active: false,
      identityHelpRequestedAt: new Date("2026-07-29T18:00:00Z"),
    });

    expect(sync.state).toBe("off");
  });

  it("is the most urgent state in the column's sort order", async () => {
    expect(syncUrgency("help_requested")).toBe(0);
    expect(SYNC_STATES_BY_URGENCY[0]).toBe("help_requested");
  });
});
