// Seed with the real clan admin plus a starter medal catalog, so the Fase 1
// vitrine has something to render. Run with: pnpm db:seed
//
// IMPORTANT: the only real data here is the member RRRRRRRREST (identity). The
// stat numbers are PLACEHOLDERS until real values arrive via manual entry
// (Fase 2) or the tracker.gg scraper (Fase 3). Medals are a starter catalog the
// admin can edit/replace in Fase 2.
//
// Idempotent: clears the tables it owns (FK-safe order) before inserting.

import type {
  MedalTier,
  MemberRole,
  Platform,
  PlayerClass,
  StatSource,
} from "@prisma/client";

import { db } from "./index";

// Three snapshots (last month + earlier this month + now) so "this month"
// deltas and progression charts have something to compute.
const MONTH_START = new Date("2026-07-01T12:00:00Z");
const NOW = new Date("2026-07-23T20:00:00Z");
const PREV_MONTH = new Date("2026-06-15T12:00:00Z");
const MANUAL: StatSource = "manual";

// Raw counters only (matches, K/D, kills-per-match and hours are derived).
type Stats = {
  kills: number;
  deaths: number;
  wins: number;
  losses: number;
  assists: number;
  revives: number;
  headshots: number;
  objectivesCaptured: number;
  timePlayedMinutes: number;
};

type SeedMember = {
  nickname: string;
  platform: Platform;
  trackerHandle: string;
  role: MemberRole;
  joinedAt: string;
  bestClass: PlayerClass;
  stats: Stats; // PLACEHOLDER numbers — see file header.
};

const MEMBERS: SeedMember[] = [
  {
    nickname: "RRRRRRRREST",
    platform: "ea",
    trackerHandle: "RRRRRRRREST",
    role: "admin",
    joinedAt: "2025-10-01",
    bestClass: "assault",
    stats: {
      kills: 5210,
      deaths: 2480,
      wins: 274,
      losses: 156,
      assists: 1830,
      revives: 940,
      headshots: 1120,
      objectivesCaptured: 610,
      timePlayedMinutes: 6120,
    },
  },
];

const MEDALS: {
  name: string;
  description: string;
  criteria: string;
  icon: string;
  tier: MedalTier;
}[] = [
  { name: "Sharpshooter", description: "Consistent high-accuracy fragging across a full session.", criteria: "20 kills without dying in a single match", icon: "crosshair", tier: "gold" },
  { name: "Anchor", description: "Held the objective when it mattered most.", criteria: "Top objective score in 5 ranked wins", icon: "shield", tier: "silver" },
  { name: "First Blood", description: "Set the pace from the opening seconds.", criteria: "First kill of the match, 10 times", icon: "swords", tier: "bronze" },
  { name: "Clutch King", description: "Turned a lost round into a win, solo.", criteria: "Win a 1vX (X >= 3) clutch", icon: "crown", tier: "legendary" },
];

// [memberNickname, medalName]
const AWARDS: [string, string][] = [
  ["RRRRRRRREST", "Sharpshooter"],
  ["RRRRRRRREST", "Clutch King"],
];

function scaleStats(stats: Stats, factor: number): Stats {
  const scaled = {} as Stats;
  for (const key of Object.keys(stats) as (keyof Stats)[]) {
    scaled[key] = Math.round(stats[key] * factor);
  }
  return scaled;
}

async function seed() {
  console.log("Clearing existing data...");
  await db.highlight.deleteMany();
  await db.memberMedal.deleteMany();
  await db.statSnapshot.deleteMany();
  await db.medal.deleteMany();
  await db.profile.deleteMany();
  await db.member.deleteMany();

  console.log("Inserting members...");
  const members = await db.member.createManyAndReturn({
    data: MEMBERS.map((m) => ({
      nickname: m.nickname,
      platform: m.platform,
      trackerHandle: m.trackerHandle,
      role: m.role,
      joinedAt: new Date(m.joinedAt),
    })),
  });
  const memberByNick = new Map(members.map((m) => [m.nickname, m]));

  console.log("Inserting medals...");
  const medals = await db.medal.createManyAndReturn({ data: MEDALS });
  const medalByName = new Map(medals.map((m) => [m.name, m]));

  console.log("Inserting stat snapshots...");
  const snapshots = MEMBERS.flatMap((m) => {
    const id = memberByNick.get(m.nickname)!.id;
    return [
      { memberId: id, capturedAt: PREV_MONTH, source: MANUAL, bestClass: m.bestClass, ...scaleStats(m.stats, 0.65) },
      { memberId: id, capturedAt: MONTH_START, source: MANUAL, bestClass: m.bestClass, ...scaleStats(m.stats, 0.85) },
      { memberId: id, capturedAt: NOW, source: MANUAL, bestClass: m.bestClass, ...m.stats },
    ];
  });
  await db.statSnapshot.createMany({ data: snapshots });

  console.log("Awarding medals...");
  await db.memberMedal.createMany({
    data: AWARDS.map(([nick, medalName]) => ({
      memberId: memberByNick.get(nick)!.id,
      medalId: medalByName.get(medalName)!.id,
    })),
  });

  console.log(`Seed complete: ${members.length} member, ${medals.length} medals, ${snapshots.length} snapshots.`);
}

seed()
  .then(async () => {
    await db.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("Seed failed:", err);
    await db.$disconnect();
    process.exit(1);
  });
