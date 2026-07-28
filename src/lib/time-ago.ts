/**
 * "agora", "há 4 min", "há 2 h", "há 3 d" — coarse on purpose, because the
 * question these answer is "is this fresh or stalled", not "how many seconds".
 *
 * `now` is a parameter instead of a call to the clock so the function stays
 * pure: callers pass the ticking value from `useNow()`, which is also what lets
 * the label keep counting while a page sits open.
 */
export function timeAgo(iso: string, now: number): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.round(hours / 24)} d`;
}
