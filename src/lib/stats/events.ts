// Activity events, written by the collector as they happen.
//
// WHY WRITTEN AND NOT DERIVED. A promotion exists for one instant: the moment a
// member's balance crosses a threshold. The only place that sees both sides of
// that crossing is the code doing the crediting. Asking the question later means
// subtracting past deltas from a mutable running total, which is the reasoning
// that once credited a member with 86.914 points for 301 minutes of play (see
// deltaForMonth). Append when it happens; read when the page loads.
//
// SESSIONS ARE MERGED, not appended per reading. The collection runs every 20
// minutes, so a member playing all evening would produce a dozen rows saying the
// same thing, and a feed of a dozen identical rows is a feed nobody reads. Instead
// the reading extends the session already open, and the row grows.

import type { ClanEventKind } from "@prisma/client";

import { db } from "@/lib/db";
import { rankForPoints, type Rank } from "@/lib/ranks";

/**
 * How long a session stays open. A reading that lands inside the window extends
 * it; one that lands after starts a new session.
 *
 * 90 minutes, from the cadence: readings arrive every 20, so the window tolerates
 * four consecutive cycles with no credited progress (a break, a lobby, a bad
 * batch) before it decides the session ended. Shorter than that and one 504 would
 * split an evening in two.
 */
export const SESSION_WINDOW_MS = 90 * 60_000;

/** The rank crossed, or null when the credit did not cross a threshold. */
export function promotionFor(pointsBefore: number, pointsAfter: number): Rank | null {
  const before = rankForPoints(pointsBefore);
  const after = rankForPoints(pointsAfter);
  return after.level > before.level ? after : null;
}

export type CreditedMember = {
  memberId: string;
  /** Balance BEFORE this cycle's credit — what makes a crossing detectable. */
  pointsBefore: number;
  pointsGained: number;
  minutesGained: number;
};

/**
 * Records what a cycle's credits mean: sessions extended or opened, promotions
 * appended.
 *
 * Never throws into the collector. The feed is a nicety and the snapshot is the
 * product: a failure here must not cost a cycle's stats, which are already
 * written by the time this runs.
 */
export async function recordCollectionEvents(
  credited: CreditedMember[],
  now: Date = new Date(),
): Promise<void> {
  if (credited.length === 0) return;

  try {
    const openSince = new Date(now.getTime() - SESSION_WINDOW_MS);
    // One query for the batch instead of one per member.
    const open = await db.clanEvent.findMany({
      where: {
        memberId: { in: credited.map((c) => c.memberId) },
        kind: "session",
        updatedAt: { gte: openSince },
      },
      select: { id: true, memberId: true },
      orderBy: { updatedAt: "desc" },
    });
    const openByMember = new Map(open.map((row) => [row.memberId, row.id]));

    const writes: Promise<unknown>[] = [];
    for (const member of credited) {
      const sessionId = openByMember.get(member.memberId);
      writes.push(
        sessionId
          ? // `increment`, not a computed total: the manual route can credit the
            // same member while the worker is mid cycle.
            db.clanEvent.update({
              where: { id: sessionId },
              data: {
                points: { increment: member.pointsGained },
                minutesPlayed: { increment: member.minutesGained },
              },
            })
          : db.clanEvent.create({
              data: {
                memberId: member.memberId,
                kind: "session" satisfies ClanEventKind,
                occurredAt: now,
                points: member.pointsGained,
                minutesPlayed: member.minutesGained,
              },
            }),
      );

      const promotion = promotionFor(
        member.pointsBefore,
        member.pointsBefore + member.pointsGained,
      );
      if (promotion) {
        writes.push(
          db.clanEvent.create({
            data: {
              memberId: member.memberId,
              kind: "promotion" satisfies ClanEventKind,
              occurredAt: now,
              points: member.pointsGained,
              rankSlug: promotion.slug,
            },
          }),
        );
      }
    }

    await Promise.all(writes);
  } catch (error) {
    console.warn(
      "[stats] nao foi possivel gravar os eventos de atividade:",
      error instanceof Error ? error.message : error,
    );
  }
}
