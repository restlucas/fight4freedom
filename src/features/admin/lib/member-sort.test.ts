import { describe, expect, it } from "vitest";

import type { MemberRole } from "@prisma/client";

import type { AdminMember, MemberActivityState, MemberSyncState } from "./queries";
import { nextSort, sortMembers } from "./member-sort";

/** Only the fields the comparators read; the rest of AdminMember is irrelevant here. */
function member(overrides: {
  nickname: string;
  role?: MemberRole;
  joinedAt?: string | null;
  activity?: MemberActivityState;
  daysSince?: number | null;
  sync?: MemberSyncState;
}): AdminMember {
  return {
    id: `id-${overrides.nickname}`,
    nickname: overrides.nickname,
    platform: "ea",
    platformId: null,
    eaName: null,
    eaUsername: null,
    statsLinked: true,
    sync: {
      state: overrides.sync ?? "ok",
      checkedAt: null,
      readAt: null,
      lastAttemptFailed: false,
      canPause: true,
      paused: false,
      helpRequestedAt: null,
      pausedReason: null,
    },
    activity: {
      state: overrides.activity ?? "playing",
      lastPlayedAt: null,
      daysSince: overrides.daysSince ?? null,
    },
    history: { snapshots: 0, events: 0, medals: 0 },
    role: overrides.role ?? "member",
    active: true,
    joinedAt: overrides.joinedAt === undefined ? "2025-01-01T00:00:00.000Z" : overrides.joinedAt,
    avatarUrl: null,
    discordId: null,
    hasAccount: false,
    isAdmin: false,
    pendingInvite: null,
    awards: [],
  };
}

const names = (rows: readonly AdminMember[]) => rows.map((row) => row.nickname);

describe("sortMembers", () => {
  it("returns the original array untouched when nothing is sorted", () => {
    const rows = [member({ nickname: "B" }), member({ nickname: "A" })];
    // Same reference, so the default order (active first, then nickname) is preserved
    // exactly as the server produced it.
    expect(sortMembers(rows, null)).toBe(rows);
  });

  it("never mutates its input", () => {
    const rows = [member({ nickname: "B" }), member({ nickname: "A" })];
    sortMembers(rows, { column: "nickname", direction: "asc" });
    expect(names(rows)).toEqual(["B", "A"]);
  });

  it("sorts by nickname in pt-BR, so accents land where a reader expects", () => {
    const rows = [
      member({ nickname: "Zeta" }),
      member({ nickname: "Águia" }),
      member({ nickname: "Ana" }),
    ];

    expect(names(sortMembers(rows, { column: "nickname", direction: "asc" }))).toEqual([
      "Águia",
      "Ana",
      "Zeta",
    ]);
    expect(names(sortMembers(rows, { column: "nickname", direction: "desc" }))).toEqual([
      "Zeta",
      "Ana",
      "Águia",
    ]);
  });

  it("sorts cargo by HIERARCHY, never alphabetically", () => {
    // Alphabetical would read admin, member, officer — not an order anyone means by
    // "cargo", and it would put the highest rank first while looking ascending.
    const rows = [
      member({ nickname: "Chefe", role: "admin" }),
      member({ nickname: "Soldado", role: "member" }),
      member({ nickname: "Sargento", role: "officer" }),
    ];

    expect(names(sortMembers(rows, { column: "role", direction: "asc" }))).toEqual([
      "Soldado",
      "Sargento",
      "Chefe",
    ]);
    expect(names(sortMembers(rows, { column: "role", direction: "desc" }))).toEqual([
      "Chefe",
      "Sargento",
      "Soldado",
    ]);
  });

  it("sorts joinedAt oldest-first on asc", () => {
    const rows = [
      member({ nickname: "Novo", joinedAt: "2026-05-01T00:00:00.000Z" }),
      member({ nickname: "Veterano", joinedAt: "2024-02-01T00:00:00.000Z" }),
    ];

    expect(names(sortMembers(rows, { column: "joinedAt", direction: "asc" }))).toEqual([
      "Veterano",
      "Novo",
    ]);
  });

  it("keeps members with no join date LAST in both directions", () => {
    // A missing date is unknown, not ancient. Letting the direction flip them would put
    // "we do not know" at the top of "mais recentes primeiro" and read as a claim.
    const rows = [
      member({ nickname: "SemData", joinedAt: null }),
      member({ nickname: "Novo", joinedAt: "2026-05-01T00:00:00.000Z" }),
      member({ nickname: "Veterano", joinedAt: "2024-02-01T00:00:00.000Z" }),
    ];

    expect(names(sortMembers(rows, { column: "joinedAt", direction: "asc" }))).toEqual([
      "Veterano",
      "Novo",
      "SemData",
    ]);
    expect(names(sortMembers(rows, { column: "joinedAt", direction: "desc" }))).toEqual([
      "Novo",
      "Veterano",
      "SemData",
    ]);
  });

  it("sorts atividade by who needs attention, with playing last", () => {
    const rows = [
      member({ nickname: "Ativo", activity: "playing" }),
      member({ nickname: "Sumido", activity: "absent", daysSince: 20 }),
      member({ nickname: "Quieto", activity: "at_risk", daysSince: 9 }),
      member({ nickname: "Quebrado", activity: "unknown" }),
      member({ nickname: "NuncaVisto", activity: "never_seen" }),
    ];

    expect(names(sortMembers(rows, { column: "activity", direction: "asc" }))).toEqual([
      "Sumido",
      "Quieto",
      "NuncaVisto",
      // Before `playing` because there IS something to do — fix the record — even though
      // it is not a person to call.
      "Quebrado",
      "Ativo",
    ]);
  });

  it("puts the quietest first inside the same activity bucket", () => {
    // Two members both at "14+ dias" are not equally worth a message when one has been
    // gone 15 days and the other 80.
    const rows = [
      member({ nickname: "Quinze", activity: "absent", daysSince: 15 }),
      member({ nickname: "Oitenta", activity: "absent", daysSince: 80 }),
    ];

    expect(names(sortMembers(rows, { column: "activity", direction: "asc" }))).toEqual([
      "Oitenta",
      "Quinze",
    ]);
  });

  it("sorts stats by urgency, keeping the rule the column already had", () => {
    const rows = [
      member({ nickname: "Ok", sync: "ok" }),
      member({ nickname: "PediuAjuda", sync: "help_requested" }),
      member({ nickname: "NuncaLido", sync: "never_read" }),
    ];

    expect(names(sortMembers(rows, { column: "sync", direction: "asc" }))).toEqual([
      "PediuAjuda",
      "NuncaLido",
      "Ok",
    ]);
  });

  it("breaks ties by nickname ascending, even when sorting descending", () => {
    // Reversing names inside a tie makes the order look unstable to anyone toggling a
    // direction back and forth.
    const rows = [
      member({ nickname: "Carlos", role: "member" }),
      member({ nickname: "Ana", role: "member" }),
      member({ nickname: "Bruno", role: "member" }),
    ];

    expect(names(sortMembers(rows, { column: "role", direction: "desc" }))).toEqual([
      "Ana",
      "Bruno",
      "Carlos",
    ]);
  });
});

describe("nextSort", () => {
  it("cycles a column through asc, desc and off", () => {
    // "Off" is a real answer: the default order is what an admin wants back after a look,
    // and without it the only route is a page reload.
    expect(nextSort(null, "role")).toEqual({ column: "role", direction: "asc" });
    expect(nextSort({ column: "role", direction: "asc" }, "role")).toEqual({
      column: "role",
      direction: "desc",
    });
    expect(nextSort({ column: "role", direction: "desc" }, "role")).toBeNull();
  });

  it("starts a different column at asc instead of inheriting the direction", () => {
    expect(nextSort({ column: "role", direction: "desc" }, "nickname")).toEqual({
      column: "nickname",
      direction: "asc",
    });
  });
});
