// Countdown formatting with progressive precision: the closer the deadline, the
// finer the unit shown. Days + hours normally, minutes in the last 7 days,
// seconds in the last 24 hours.

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type CountdownParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

/** Splits a duration in milliseconds into whole units. Negative → all zeros. */
export function countdownParts(ms: number): CountdownParts {
  const remaining = Math.max(0, ms);
  return {
    days: Math.floor(remaining / DAY),
    hours: Math.floor((remaining % DAY) / HOUR),
    minutes: Math.floor((remaining % HOUR) / MINUTE),
    seconds: Math.floor((remaining % MINUTE) / SECOND),
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Formats a remaining duration, adding units as the deadline approaches:
 * `12d 04h` → `6d 04h 33m` (under 7 days) → `04h 33m 12s` (under 1 day).
 */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "Encerrado";

  const { days, hours, minutes, seconds } = countdownParts(ms);
  const segments: string[] = [];

  if (days > 0) segments.push(`${days}d`);
  segments.push(`${pad(hours)}h`);
  if (ms < 7 * DAY) segments.push(`${pad(minutes)}m`);
  if (ms < DAY) segments.push(`${pad(seconds)}s`);

  return segments.join(" ");
}
