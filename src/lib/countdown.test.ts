import { describe, expect, it } from "vitest";

import { countdownParts, formatCountdown } from "./countdown";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("countdownParts", () => {
  it("splits a duration into whole units", () => {
    expect(countdownParts(2 * DAY + 3 * HOUR + 4 * MINUTE + 5 * SECOND)).toEqual(
      { days: 2, hours: 3, minutes: 4, seconds: 5 },
    );
  });

  it("clamps negative durations to zero", () => {
    expect(countdownParts(-5000)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    });
  });
});

describe("formatCountdown", () => {
  it("shows days and hours when the deadline is far away", () => {
    expect(formatCountdown(12 * DAY + 4 * HOUR + 33 * MINUTE)).toBe("12d 04h");
  });

  it("adds minutes in the last 7 days", () => {
    expect(formatCountdown(6 * DAY + 4 * HOUR + 33 * MINUTE + 9 * SECOND)).toBe(
      "6d 04h 33m",
    );
  });

  it("keeps minutes hidden exactly at 7 days", () => {
    expect(formatCountdown(7 * DAY)).toBe("7d 00h");
  });

  it("adds seconds in the last 24 hours and drops the zero days", () => {
    expect(formatCountdown(4 * HOUR + 33 * MINUTE + 12 * SECOND)).toBe(
      "04h 33m 12s",
    );
  });

  it("adds minutes but not seconds exactly at 1 day", () => {
    expect(formatCountdown(DAY)).toBe("1d 00h 00m");
  });

  it("reports a finished countdown", () => {
    expect(formatCountdown(0)).toBe("Encerrado");
    expect(formatCountdown(-1)).toBe("Encerrado");
  });
});
