import { describe, expect, it } from "vitest";

import { emptyTotals, type StatTotals } from "@/lib/stats/snapshots";

import { findStatLeaders, isStatLeader, sortByStat, statValue } from "./stat-keys";

function member(id: string, partial: Partial<StatTotals>) {
  return { id, totals: { ...emptyTotals(), ...partial } };
}

describe("statValue", () => {
  it("derives each sortable stat", () => {
    const totals = { ...emptyTotals(), kills: 200, deaths: 100, wins: 12, losses: 8, timePlayedMinutes: 120 };
    expect(statValue(totals, "kd")).toBe(2);
    expect(statValue(totals, "kills")).toBe(200);
    expect(statValue(totals, "matches")).toBe(20);
    expect(statValue(totals, "hours")).toBe(2);
  });
});

describe("findStatLeaders", () => {
  const members = [
    member("a", { kills: 300, deaths: 300, wins: 40, losses: 10, timePlayedMinutes: 600 }),
    member("b", { kills: 100, deaths: 20, wins: 5, losses: 5, timePlayedMinutes: 1200 }),
  ];

  it("crowns the top member of each stat", () => {
    const leaders = findStatLeaders(members);
    expect(leaders.kills).toEqual(["a"]); // 300 > 100
    expect(leaders.matches).toEqual(["a"]); // 50 > 10
    expect(leaders.kd).toEqual(["b"]); // 5.0 > 1.0
    expect(leaders.hours).toEqual(["b"]); // 20 h > 10 h
  });

  it("crowns every member tied at the top", () => {
    const leaders = findStatLeaders([
      member("a", { kills: 100 }),
      member("b", { kills: 100 }),
      member("c", { kills: 50 }),
    ]);
    expect(leaders.kills).toEqual(["a", "b"]);
  });

  it("leaves a stat with no activity uncrowned", () => {
    const leaders = findStatLeaders([member("a", {}), member("b", {})]);
    expect(leaders.kills).toEqual([]);
    expect(leaders.hours).toEqual([]);
  });

  it("has no leaders for an empty roster", () => {
    expect(findStatLeaders([])).toEqual({ kd: [], kills: [], matches: [], hours: [] });
  });
});

describe("isStatLeader", () => {
  it("checks membership safely", () => {
    const leaders = findStatLeaders([member("a", { kills: 10 })]);
    expect(isStatLeader(leaders, "kills", "a")).toBe(true);
    expect(isStatLeader(leaders, "kills", "b")).toBe(false);
    expect(isStatLeader(undefined, "kills", "a")).toBe(false);
  });
});

describe("sortByStat", () => {
  const members = [
    member("a", { kills: 100 }),
    member("b", { kills: 300 }),
    member("c", { kills: 200 }),
  ];

  it("sorts descending", () => {
    expect(sortByStat(members, "kills", "desc").map((m) => m.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts ascending", () => {
    expect(sortByStat(members, "kills", "asc").map((m) => m.id)).toEqual(["a", "c", "b"]);
  });

  it("does not mutate the input", () => {
    sortByStat(members, "kills", "desc");
    expect(members.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });
});
