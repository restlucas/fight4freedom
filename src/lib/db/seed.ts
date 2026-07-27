// Seed with the real clan admin plus a starter medal catalog, so the Fase 1
// vitrine has something to render. Run with: pnpm db:seed
//
// IMPORTANT: the only real data here is the member RRRRRRRREST (identity + EA
// ids). The stat numbers are PLACEHOLDERS until the first collection run
// replaces them (/api/stats/collect, Fase 3). Medals are a starter catalog the
// admin can edit/replace in Fase 2.
//
// Idempotent: clears the tables it owns (FK-safe order) before inserting.

import type { MedalTier, MemberRole, Platform, PlayerClass, StatSource } from "@prisma/client";

import { generateInviteToken, hashInviteToken, inviteExpiresAt, inviteUrl } from "../auth/invite";
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
  /**
   * Exact public id on the platform: shown on hover over the platform icon and
   * used as the lookup key for the stats collection. Only the real member has a
   * value that exists on EA; the example roster's are made up, which is fine
   * because those members have no Discord linked and are never collected.
   */
  platformId: string;
  /**
   * EA identity used by the stats collector. Only real members have it; the
   * example roster keeps null so the collector never queries the API for
   * players that do not exist.
   */
  eaPersonaId: string | null;
  eaNucleusId: string | null;
  role: MemberRole;
  joinedAt: string;
  bestClass: PlayerClass;
  stats: Stats; // PLACEHOLDER numbers — see file header.
  /**
   * Share of the lifetime stats earned during the current month. Drives the
   * monthly ranking, so it varies per member — otherwise the ranking would be
   * an exact copy of the all-time kill leaderboard.
   */
  monthShare: number;
  /** MOCK cumulative career points driving the rank in src/lib/ranks.ts. */
  rankPoints: number;
};

const REAL_MEMBERS: SeedMember[] = [
  {
    nickname: "RRRRRRRREST",
    platform: "ea",
    platformId: "RRRRRRRREST",
    // Real ids, resolved via GET /bf6/player/?name=RRRRRRRREST (2026-07-25).
    eaPersonaId: "1111751848",
    eaNucleusId: "1000707516734",
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
    monthShare: 0.15,
    // General de Divisão (12.500), partway to General de Exército (16.000).
    rankPoints: 13_000,
  },
];

// EXAMPLE ROSTER — placeholders so the ranking, the infinite scroll (15 per
// page) and the sort filters have enough data to exercise. Replace with the
// real roster from fight4freedom.com.br.
const EXAMPLE_NICKNAMES = [
  "Vortex",
  "TangoDown",
  "BlackWolf",
  "Reaper",
  "GhostBR",
  "Panzer",
  "Falcao",
  "ZeusPrime",
  "Nomad",
  "Viper",
  "Havoc",
  "Sabotage",
  "IronHand",
  "NightOwl",
  "Kraken",
  "Bandido",
  "Trovao",
  "Cascavel",
  "Predador",
  "Sentinela",
  "Fantasma",
  "Tempestade",
  "Aguia",
  "Lobo",
  "Escorpiao",
  "Chumbo",
  "Rajada",
  "Coyote",
  "Meteoro",
];

const PLATFORMS: Platform[] = ["ea", "xbox", "psn"];
const CLASSES: PlayerClass[] = ["assault", "engineer", "support", "recon"];

/** Deterministic PRNG so every reseed produces the same board. */
function pseudoRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** Plausible platform id per platform, so the hover has something real to show. */
function examplePlatformId(nickname: string, platform: Platform, index: number): string {
  switch (platform) {
    case "ea":
      return `${nickname}BR`;
    case "xbox":
      return `${nickname} ${100 + index}`;
    case "psn":
      return `${nickname}_${index}`;
  }
}

function exampleMember(nickname: string, index: number): SeedMember {
  const random = pseudoRandom(index + 1);
  const skill = 0.4 + random() * 1.6; // overall volume multiplier
  const accuracy = 0.8 + random() * 1.1; // kills per death
  const matches = Math.round(90 + random() * 420);
  const kills = Math.round(matches * (6 + random() * 9) * accuracy);
  const platform = PLATFORMS[index % PLATFORMS.length];

  return {
    nickname,
    platform,
    platformId: examplePlatformId(nickname, platform, index),
    eaPersonaId: null,
    eaNucleusId: null,
    role: index % 9 === 0 ? "officer" : "member",
    joinedAt: `2025-1${(index % 2) + 1}-${String((index % 27) + 1).padStart(2, "0")}`,
    bestClass: CLASSES[index % CLASSES.length],
    stats: {
      kills,
      deaths: Math.round(kills / accuracy),
      wins: Math.round(matches * (0.4 + random() * 0.25)),
      losses: Math.round(matches * (0.35 + random() * 0.2)),
      assists: Math.round(kills * (0.25 + random() * 0.3)),
      revives: Math.round(matches * (0.6 + random() * 2.4) * skill),
      headshots: Math.round(kills * (0.12 + random() * 0.18)),
      objectivesCaptured: Math.round(matches * (0.5 + random() * 1.8)),
      timePlayedMinutes: Math.round(matches * (14 + random() * 10)),
    },
    // 2% to 32% of the lifetime numbers happened this month.
    monthShare: 0.02 + random() * 0.3,
    // MOCK: curved so the roster spreads across the whole ladder, from Soldado
    // up to the generals, instead of bunching in the middle.
    rankPoints: Math.round(20_500 * random() ** 1.6),
  };
}

const MEMBERS: SeedMember[] = [...REAL_MEMBERS, ...EXAMPLE_NICKNAMES.map(exampleMember)];

// Public-facing copy is pt-BR (the vitrine's language); `icon` is a curated
// lucide name used as fallback until an admin uploads artwork (`imageUrl`).
const MEDALS: {
  name: string;
  description: string;
  criteria: string;
  icon: string;
  tier: MedalTier;
}[] = [
  {
    name: "Sharpshooter",
    description: "Precisão cirúrgica do começo ao fim da sessão.",
    criteria: "20 kills sem morrer em uma única partida",
    icon: "crosshair",
    tier: "legendary",
  },
  {
    name: "Anchor",
    description: "Segurou o objetivo na hora em que mais importava.",
    criteria: "Maior pontuação de objetivo em 5 vitórias",
    icon: "shield",
    tier: "rare",
  },
  {
    name: "First Blood",
    description: "Ditou o ritmo desde os primeiros segundos.",
    criteria: "Primeira kill da partida, 10 vezes",
    icon: "swords",
    tier: "common",
  },
  {
    name: "Clutch King",
    description: "Virou um round perdido sozinho.",
    criteria: "Vencer um clutch 1vX (X >= 3)",
    icon: "crown",
    tier: "legendary",
  },
  {
    name: "Operação Liberdade",
    description: "Campeão do torneio interno do clã.",
    criteria: "Vencer um evento oficial do Fight4Freedom",
    icon: "trophy",
    tier: "special",
  },
  {
    name: "Médico de Guerra",
    description: "Manteve o esquadrão de pé sob fogo.",
    criteria: "50 revives em uma semana",
    icon: "star",
    tier: "rare",
  },
];

// [memberNickname, medalName]
const AWARDS: [string, string][] = [
  // Six medals on one member, so the listing exercises the "+N" overflow
  // (the stack previews five).
  ["RRRRRRRREST", "Sharpshooter"],
  ["RRRRRRRREST", "Clutch King"],
  ["RRRRRRRREST", "Operação Liberdade"],
  ["RRRRRRRREST", "Anchor"],
  ["RRRRRRRREST", "First Blood"],
  ["RRRRRRRREST", "Médico de Guerra"],
  // Spread across the example roster so the catalog shows avatar stacks.
  ["Vortex", "Sharpshooter"],
  ["Reaper", "Sharpshooter"],
  ["GhostBR", "Sharpshooter"],
  ["Panzer", "Sharpshooter"],
  ["Falcao", "Sharpshooter"],
  ["Viper", "Sharpshooter"],
  ["Vortex", "Anchor"],
  ["Kraken", "Anchor"],
  ["Trovao", "First Blood"],
  ["Predador", "First Blood"],
  ["Vortex", "Operação Liberdade"],
];

function scaleStats(stats: Stats, factor: number): Stats {
  const scaled = {} as Stats;
  for (const key of Object.keys(stats) as (keyof Stats)[]) {
    scaled[key] = Math.round(stats[key] * factor);
  }
  return scaled;
}

/**
 * Bootstrap: the very first admin claims an invite like everyone else, so account
 * creation has ONE code path — no env-based admin list, and no "first login wins",
 * which would hand the panel to whoever logs in first after a deploy.
 */
async function createBootstrapInvite(memberId: string, nickname: string) {
  const token = generateInviteToken();
  await db.memberInvite.create({
    data: {
      memberId,
      tokenHash: hashInviteToken(token),
      grantsAdmin: true,
      discordUsername: nickname,
      expiresAt: inviteExpiresAt(new Date()),
    },
  });
  const url = inviteUrl(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000", token);
  console.log(`\n  Convite de admin para ${nickname} (uso único, 7 dias):`);
  console.log(`  ${url}\n`);
}

async function seed() {
  console.log("Clearing existing data...");
  await db.highlight.deleteMany();
  await db.memberMedal.deleteMany();
  await db.statSnapshot.deleteMany();
  await db.medal.deleteMany();
  await db.memberInvite.deleteMany();
  await db.profile.deleteMany();
  await db.member.deleteMany();

  console.log("Inserting members...");
  const members = await db.member.createManyAndReturn({
    data: MEMBERS.map((m) => ({
      nickname: m.nickname,
      platform: m.platform,
      platformId: m.platformId,
      eaPersonaId: m.eaPersonaId,
      eaNucleusId: m.eaNucleusId,
      role: m.role,
      joinedAt: new Date(m.joinedAt),
      rankPoints: m.rankPoints,
    })),
  });
  const memberByNick = new Map(members.map((m) => [m.nickname, m]));

  console.log("Inserting medals...");
  const medals = await db.medal.createManyAndReturn({ data: MEDALS });
  const medalByName = new Map(medals.map((m) => [m.name, m]));

  console.log("Inserting stat snapshots...");
  // Three snapshots per member. The month delta (MONTH_START -> NOW) is what the
  // ranking scores, and each member's monthShare makes it different from their
  // lifetime totals.
  const snapshots = MEMBERS.flatMap((m) => {
    const id = memberByNick.get(m.nickname)!.id;
    const startOfMonth = 1 - m.monthShare;
    return [
      {
        memberId: id,
        capturedAt: PREV_MONTH,
        source: MANUAL,
        bestClass: m.bestClass,
        ...scaleStats(m.stats, startOfMonth * 0.8),
      },
      {
        memberId: id,
        capturedAt: MONTH_START,
        source: MANUAL,
        bestClass: m.bestClass,
        ...scaleStats(m.stats, startOfMonth),
      },
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

  console.log(
    `Seed complete: ${members.length} members, ${medals.length} medals, ${snapshots.length} snapshots.`,
  );

  const owner = memberByNick.get(REAL_MEMBERS[0].nickname)!;
  await createBootstrapInvite(owner.id, owner.nickname);
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
