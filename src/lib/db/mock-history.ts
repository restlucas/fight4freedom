// Fabricates closed ranking seasons so the season picker on /ranking has
// something to show before the real collection accumulates months. Run with:
//
//   pnpm db:mock-history            # dry run, prints the boards it would create
//   pnpm db:mock-history --apply
//
// Scope, agreed 2026-07-27: the THREE months before the current one, top 10 only.
//
// HOW A FABRICATED SEASON HAS TO BE SHAPED
//
// The ranking never reads a stored score. It scores the DELTA between the first
// and the last snapshot inside a month (deltaForMonth), and snapshots hold
// CUMULATIVE career totals. So mock data cannot be a list of monthly scores —
// it has to be a coherent rising career, or the deltas come out wrong or
// negative. Per member this writes, for each month, a snapshot on the 1st and
// one on the last day, where each month opens exactly where the previous closed.
//
// The rows are written with `source: manual`, which is what marks placeholder
// data project-wide (the collector only ever writes `api`). One consequence
// worth knowing: `pnpm db:clean-examples` deletes every `manual` snapshot, so it
// wipes this history too — correct behaviour, since this is scaffolding, but it
// means the two scripts are opposites and running them in the wrong order costs
// you the mock.

import type { PlayerClass, StatSource } from "@prisma/client";

import { monthKey } from "@/lib/month";
import { computePoints } from "@/lib/stats/points";
import { emptyTotals, type StatTotals } from "@/lib/stats/snapshots";

import { db } from "./index";

const APPLY = process.argv.includes("--apply");
const MANUAL: StatSource = "manual";

/** Board size for a fabricated season. */
const TOP_N = 10;
/** How many closed seasons to fabricate, counting back from the current month. */
const SEASONS = 3;

const CLASSES: PlayerClass[] = ["assault", "engineer", "support", "recon"];

/** Deterministic PRNG, so re-running produces the same history. */
function pseudoRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/**
 * One month of play for one member, weighted toward the counters the ranking
 * actually rewards — a mock built on kills would make the new scheme look broken
 * on the very page that advertises it.
 */
function monthlyGain(random: () => number): StatTotals {
  // Activity level for the month: some members barely played, others grinded.
  const matches = Math.round(12 + random() * 68);
  const teamwork = 0.5 + random() * 1.4; // how objective-minded they were
  const aim = 0.6 + random() * 1.1;

  const wins = Math.round(matches * (0.4 + random() * 0.2));
  const kills = Math.round(matches * (8 + random() * 16) * aim);

  return {
    ...emptyTotals(),
    kills,
    deaths: Math.round(matches * (7 + random() * 5)),
    wins,
    losses: matches - wins,
    assists: Math.round(matches * (6 + random() * 8) * teamwork),
    revives: Math.round(matches * (2 + random() * 7) * teamwork),
    headshots: Math.round(kills * (0.1 + random() * 0.15)),
    objectivesCaptured: Math.round(matches * (0.8 + random() * 2.5) * teamwork),
    objectivesDefended: Math.round(matches * (1.5 + random() * 4) * teamwork),
    objectivesDestroyed: Math.round(random() * 3 * teamwork),
    objectivesArmed: Math.round(random() * 4 * teamwork),
    objectivesDisarmed: Math.round(random() * 3 * teamwork),
    sectorsDefended: Math.round(random() * 6 * teamwork),
    objectiveTimeSeconds: Math.round(matches * (90 + random() * 220) * teamwork),
    spots: Math.round(matches * (1 + random() * 6)),
    healthRestored: Math.round(matches * (10 + random() * 90) * teamwork),
    repairs: Math.round(matches * random() * 14),
    timePlayedMinutes: Math.round(matches * (13 + random() * 11)),
  };
}

function addTotals(a: StatTotals, b: StatTotals): StatTotals {
  const out = emptyTotals();
  for (const key of Object.keys(out) as (keyof StatTotals)[]) out[key] = a[key] + b[key];
  return out;
}

/** Season keys for the N months before `reference`, oldest first. */
function pastSeasons(reference: Date, count: number): string[] {
  const keys: string[] = [];
  for (let back = count; back >= 1; back--) {
    const d = new Date(
      Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - back, 15, 12),
    );
    keys.push(monthKey(d));
  }
  return keys;
}

/**
 * Whether a member may receive mocked rows for the OPEN season.
 *
 * Only members the collector never touches. A member who linked Discord is
 * collected every 10 minutes, and mixing the two in the same month is not merely
 * untidy — it corrupts the board. The delta is last-minus-first inside the
 * month, so a mock opening row (a few hundred kills) followed by a real closing
 * row (a full career, tens of thousands) reports the member's entire lifetime as
 * this month's progress. Past seasons are safe: the collector only ever writes
 * "now", so it can never land in a closed month.
 */
function eligibleForOpenSeason(member: { discordId: string | null }): boolean {
  return member.discordId === null;
}

/**
 * First and last instants to stamp inside a season, in Brasília terms.
 *
 * The open season closes at `now` instead of at the end of the month: stamping a
 * snapshot in the future would put a capture date after the moment it was
 * written, and the countdown on /ranking would be counting down to a board that
 * already claims to be finished.
 */
function seasonStamps(season: string, now: Date): { opens: Date; closes: Date } {
  const [year, month] = season.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(year, month, 0, 23));
  return {
    // 03:00Z on the 1st = midnight in Brasília, the first moment of the season.
    opens: new Date(Date.UTC(year, month - 1, 1, 3)),
    closes: monthEnd > now ? now : monthEnd,
  };
}

async function main() {
  const now = new Date();
  const openSeason = monthKey(now);
  const seasons = [...pastSeasons(now, SEASONS), openSeason];

  // Real members first: a fabricated history is more useful when the people who
  // actually exist appear in it. Example-roster members fill the rest of the top 10.
  const members = await db.member.findMany({
    where: { active: true },
    select: { id: true, nickname: true, discordId: true },
    orderBy: [{ discordId: { sort: "desc", nulls: "last" } }, { nickname: "asc" }],
    take: TOP_N,
  });

  if (members.length === 0) {
    console.error("\n  Nenhum membro ativo. Cadastre membros antes de gerar histórico.\n");
    process.exit(1);
  }
  if (members.length < TOP_N) {
    console.warn(
      `\n  Aviso: só ${members.length} membros ativos, então o top ${TOP_N} sai incompleto.`,
    );
  }

  type Row = {
    memberId: string;
    capturedAt: Date;
    source: StatSource;
    bestClass: PlayerClass;
  } & StatTotals;

  const rows: Row[] = [];
  const boards = new Map<string, { nickname: string; points: number }[]>();

  members.forEach((member, index) => {
    const random = pseudoRandom(index + 17);
    const bestClass = CLASSES[index % CLASSES.length];

    // Career already under way before the mocked history starts, so the oldest
    // board does not look like everyone's first month in the game.
    let career = monthlyGain(random);

    for (const season of seasons) {
      const gain = monthlyGain(random);
      const closing = addTotals(career, gain);

      // The career advances either way, so skipping the open season for a
      // collected member does not leave a hole in their earlier months.
      const skip = season === openSeason && !eligibleForOpenSeason(member);
      if (!skip) {
        const { opens, closes } = seasonStamps(season, now);
        rows.push({ memberId: member.id, capturedAt: opens, source: MANUAL, bestClass, ...career });
        rows.push({
          memberId: member.id,
          capturedAt: closes,
          source: MANUAL,
          bestClass,
          ...closing,
        });

        const board = boards.get(season) ?? [];
        board.push({ nickname: member.nickname, points: computePoints(gain) });
        boards.set(season, board);
      }

      // Next season opens exactly where this one closed.
      career = closing;
    }
  });

  const skipped = members.filter((m) => !eligibleForOpenSeason(m));

  console.log(`\n  ${APPLY ? "Gravando" : "Dry run (nada sera gravado)"}:`);
  console.log(`    temporadas encerradas: ${seasons.slice(0, -1).join(", ")}`);
  console.log(`    temporada em curso: ${openSeason} (fecha o snapshot em "agora")`);
  console.log(`    membros: ${members.length}`);
  console.log(`    snapshots: ${rows.length}`);
  if (skipped.length > 0) {
    console.log(
      `    fora da temporada em curso (a coleta real cuida deles): ` +
        skipped.map((m) => m.nickname).join(", "),
    );
  }

  for (const season of seasons) {
    const board = (boards.get(season) ?? []).sort((a, b) => b.points - a.points);
    console.log(`\n    ${season}`);
    board.forEach((entry, i) => {
      console.log(
        `      ${String(i + 1).padStart(2)}. ${entry.nickname.padEnd(18)} ${entry.points} pts`,
      );
    });
  }

  if (!APPLY) {
    console.log("\n  Para aplicar: pnpm db:mock-history --apply\n");
    return;
  }

  // Idempotent: clear only the mocked window, and only `manual` rows, so
  // re-running neither stacks duplicates nor touches what the collector wrote.
  const { opens: firstOpens } = seasonStamps(seasons[0], now);
  const { closes: lastCloses } = seasonStamps(seasons[seasons.length - 1], now);
  const cleared = await db.statSnapshot.deleteMany({
    where: { source: MANUAL, capturedAt: { gte: firstOpens, lte: lastCloses } },
  });

  await db.statSnapshot.createMany({ data: rows });
  console.log(
    `\n  Pronto: ${cleared.count} snapshots mockados anteriores removidos, ${rows.length} gravados.\n`,
  );
}

main()
  .then(async () => {
    await db.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("Falhou:", err);
    await db.$disconnect();
    process.exit(1);
  });
