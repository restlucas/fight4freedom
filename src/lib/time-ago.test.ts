import { describe, expect, it } from "vitest";

import { timeAgo } from "./time-ago";

const NOW = new Date("2026-07-28T12:00:00Z").getTime();

function ago(ms: number): string {
  return timeAgo(new Date(NOW - ms).toISOString(), NOW);
}

describe("timeAgo", () => {
  it("says 'agora' inside the first half minute", () => {
    expect(ago(5_000)).toBe("agora");
  });

  it.each([
    [60_000, "há 1 min"],
    [4 * 60_000, "há 4 min"],
    [59 * 60_000, "há 59 min"],
  ])("renders %i ms as %s", (ms, expected) => {
    expect(ago(ms)).toBe(expected);
  });

  it("switches to hours past the hour", () => {
    expect(ago(2 * 60 * 60_000)).toBe("há 2 h");
  });

  it("switches to days past the day", () => {
    expect(ago(3 * 24 * 60 * 60_000)).toBe("há 3 d");
  });
});
