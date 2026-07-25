import { describe, expect, it } from "vitest";

import {
  monthEndsAt,
  monthKey,
  monthKeyToReference,
  monthStartsAt,
} from "./month";

describe("monthEndsAt", () => {
  it("returns midnight of the 1st of the next month in Brasília (03:00 UTC)", () => {
    expect(monthEndsAt(new Date("2026-07-10T12:00:00Z")).toISOString()).toBe(
      "2026-08-01T03:00:00.000Z",
    );
  });

  it("rolls over the year in December", () => {
    expect(monthEndsAt(new Date("2026-12-20T00:00:00Z")).toISOString()).toBe(
      "2027-01-01T03:00:00.000Z",
    );
  });

  it("still belongs to the previous month late on the last UTC day", () => {
    // 23:00 UTC on July 31st is 20:00 in Brasília — still July.
    expect(monthEndsAt(new Date("2026-07-31T23:00:00Z")).toISOString()).toBe(
      "2026-08-01T03:00:00.000Z",
    );
  });

  it("already counts as the next month just after the boundary", () => {
    expect(monthEndsAt(new Date("2026-08-01T03:00:01Z")).toISOString()).toBe(
      "2026-09-01T03:00:00.000Z",
    );
  });
});

describe("monthStartsAt", () => {
  it("returns midnight of the 1st in Brasília", () => {
    expect(monthStartsAt(new Date("2026-07-10T12:00:00Z")).toISOString()).toBe(
      "2026-07-01T03:00:00.000Z",
    );
  });
});

describe("monthKey", () => {
  it("formats the Brasília year and month, zero padded", () => {
    expect(monthKey(new Date("2026-07-10T12:00:00Z"))).toBe("2026-07");
    expect(monthKey(new Date("2026-01-02T12:00:00Z"))).toBe("2026-01");
  });

  it("is stable across the whole month, so the cache key does not churn", () => {
    expect(monthKey(new Date("2026-07-01T03:00:00Z"))).toBe("2026-07");
    expect(monthKey(new Date("2026-07-31T23:59:59Z"))).toBe("2026-07");
  });

  it("uses the Brasília calendar, not UTC", () => {
    // 01:00 UTC on August 1st is still 22:00 of July 31st in Brasília.
    expect(monthKey(new Date("2026-08-01T01:00:00Z"))).toBe("2026-07");
    expect(monthKey(new Date("2026-08-01T03:00:00Z"))).toBe("2026-08");
  });
});

describe("monthKeyToReference", () => {
  it("lands inside the month it came from", () => {
    expect(monthKeyToReference("2026-07").toISOString()).toBe(
      "2026-07-15T12:00:00.000Z",
    );
  });

  it("round-trips with monthKey", () => {
    for (const key of ["2026-01", "2026-07", "2026-12"]) {
      expect(monthKey(monthKeyToReference(key))).toBe(key);
    }
  });
});
