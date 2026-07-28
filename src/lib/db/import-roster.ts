// One-time import of the roster that already existed on the v1 site
// (fight4freedom.com.br). Run with:
//
//   pnpm db:import-roster            # dry run, prints exactly what it would do
//   pnpm db:import-roster --apply
//
// Source: data/membros-atual.txt — JSON, `{ membros: [...] }`. That folder is
// gitignored, and the file deliberately does NOT live under public/: anything
// there is served as a static asset, so the dump — which carries every member's
// exact platform id — would be downloadable from the site.
//
// Only four fields are read; everything else in the export belongs to the old
// site's own scoring and has no equivalent here:
//
//   Nome                          -> nickname (display only)
//   ID                            -> platformId (the exact account id; the stats key)
//   Plataforma                    -> platform  ("PC" -> ea, "PS5" -> psn, "XBOX" -> xbox)
//   progressao.patenteAtual.nome  -> rankPoints, via the ladder in src/lib/ranks.ts
//
// WHY IT WRITES rankPoints AND NOT A RANK NAME
//
// We have no rank column: `src/lib/ranks.ts` DERIVES the rank from `rankPoints`.
// So preserving someone's rank means writing the point threshold our ladder maps
// to that rank. Their thresholds differ from ours (their Marechal is 5.000, ours
// is 20.000), which is why their point values are ignored and only the rank NAME
// carries over.
//
// WHAT IT DOES NOT OVERWRITE
//
// A member already in the database who has a RESOLVED EA identity keeps their
// `platformId`. That value has been proven to resolve against EA and to return
// stats; the list's value has not. This matters concretely: the admin appears in
// the export with `ID: "MELA123"`, while the database holds the working
// `RRRRRRRREST`. Trusting the list there would break their collection.
//
// Members with a `profile` (someone really logged in as them) are never deleted,
// even when absent from the list.

import type { MemberRole, Platform } from "@prisma/client";

import { RANKS } from "@/lib/ranks";

import { EXAMPLE_NICKNAMES } from "./example-roster";
import { db } from "./index";

const APPLY = process.argv.includes("--apply");
const SOURCE = "data/membros-atual.txt";

/** Their platform labels, upper-case in the export, to our enum. */
const PLATFORM_MAP: Record<string, Platform> = {
  PC: "ea",
  PS5: "psn",
  PS4: "psn",
  PSN: "psn",
  XBOX: "xbox",
};

/**
 * Their rank spelling to ours. The difference is ordinal notation — they write
 * "3º Sargento", the Army (and our ladder) writes "Terceiro-Sargento" — so a
 * plain name match would miss most of the roster.
 *
 * Deliberately an explicit table and not a regex: an unknown rank must stop the
 * import with a name to look at, rather than quietly land everyone on Soldado.
 */
const RANK_ALIASES: Record<string, string> = {
  Soldado: "Soldado",
  Cabo: "Cabo",
  "3º Sargento": "Terceiro-Sargento",
  "2º Sargento": "Segundo-Sargento",
  "1º Sargento": "Primeiro-Sargento",
  Subtenente: "Subtenente",
  "2º Tenente": "Segundo-Tenente",
  "1º Tenente": "Primeiro-Tenente",
  Capitão: "Capitão",
  Major: "Major",
  "Tenente-Coronel": "Tenente-Coronel",
  Coronel: "Coronel",
  "General de Brigada": "General de Brigada",
  "General de Divisão": "General de Divisão",
  "General de Exército": "General de Exército",
  Marechal: "Marechal",
};

type SourceMember = {
  Nome?: string;
  ID?: string;
  Plataforma?: string;
  progressao?: { patenteAtual?: { nome?: string } | null } | null;
};

type Parsed = {
  nickname: string;
  platformId: string;
  platform: Platform;
  rankName: string;
  rankPoints: number;
};

/** Points that put a member exactly at the bottom of the given rank. */
function pointsForRank(rankName: string): number {
  const canonical = RANK_ALIASES[rankName];
  const rank = RANKS.find((r) => r.name === canonical);
  if (!rank) {
    throw new Error(
      `Patente desconhecida: "${rankName}". Adicione em RANK_ALIASES ou corrija a lista.`,
    );
  }
  return rank.threshold;
}

function parseSource(raw: string): { members: Parsed[]; problems: string[] } {
  const parsed = JSON.parse(raw) as { membros?: SourceMember[] };
  const rows = parsed.membros ?? [];
  const members: Parsed[] = [];
  const problems: string[] = [];
  const seen = new Map<string, string>();

  rows.forEach((row, index) => {
    const at = `linha ${index + 1}`;
    // Trailing spaces exist in the export (three rows), and a platformId with a
    // stray space never resolves on EA — so trim before anything else.
    const nickname = (row.Nome ?? "").trim();
    const platformId = (row.ID ?? "").trim();
    const rawPlatform = (row.Plataforma ?? "").trim().toUpperCase();
    const rankName = (row.progressao?.patenteAtual?.nome ?? "").trim();

    if (!nickname) return problems.push(`${at}: sem Nome, ignorado`);
    if (!platformId) return problems.push(`${at} (${nickname}): sem ID, ignorado`);

    const platform = PLATFORM_MAP[rawPlatform];
    if (!platform) {
      return problems.push(`${at} (${nickname}): plataforma "${row.Plataforma}" nao mapeada`);
    }

    // Two members on the same account id would fight over one EA identity.
    const key = platformId.toLowerCase();
    const previous = seen.get(key);
    if (previous) {
      return problems.push(`${at} (${nickname}): ID "${platformId}" repete ${previous}, ignorado`);
    }
    seen.set(key, nickname);

    members.push({
      nickname,
      platformId,
      platform,
      rankName,
      rankPoints: rankName ? pointsForRank(rankName) : 0,
    });
  });

  return { members, problems };
}

async function main() {
  const { readFileSync } = await import("node:fs");
  const { members, problems } = parseSource(readFileSync(SOURCE, "utf8"));

  const existing = await db.member.findMany({
    select: {
      id: true,
      nickname: true,
      platformId: true,
      eaPersonaId: true,
      discordId: true,
      _count: { select: { profiles: true } },
    },
  });

  // Match on nickname, trimmed and case-insensitive: it is the only field shared
  // between the export and the rows already here, and platformId is exactly what
  // the export gets wrong for the admin.
  const byNick = new Map(existing.map((m) => [m.nickname.trim().toLowerCase(), m]));
  const listedNicks = new Set(members.map((m) => m.nickname.toLowerCase()));

  const toUpdate = members.filter((m) => byNick.has(m.nickname.toLowerCase()));
  const toCreate = members.filter((m) => !byNick.has(m.nickname.toLowerCase()));

  // Anything not in the list goes, EXCEPT accounts somebody logged into.
  const absent = existing.filter((m) => !listedNicks.has(m.nickname.trim().toLowerCase()));
  const toDelete = absent.filter((m) => m._count.profiles === 0);
  const keptDespiteAbsent = absent.filter((m) => m._count.profiles > 0);

  // platformId is preserved wherever EA already resolved it — see the header.
  const keepingPlatformId = toUpdate
    .map((m) => ({ parsed: m, current: byNick.get(m.nickname.toLowerCase())! }))
    .filter(
      (pair) =>
        pair.current.eaPersonaId !== null &&
        (pair.current.platformId ?? "").toLowerCase() !== pair.parsed.platformId.toLowerCase(),
    );

  const snapshots = await db.statSnapshot.count();

  console.log(`\n  ${APPLY ? "APLICANDO" : "Dry run (nada sera gravado)"} — fonte: ${SOURCE}`);
  console.log(`    membros na lista: ${members.length}`);
  console.log(`    criar: ${toCreate.length}`);
  console.log(`    atualizar (ja existem): ${toUpdate.length}`);
  console.log(`    apagar (fora da lista, sem login): ${toDelete.length}`);
  console.log(`    apagar snapshots (todo o historico mockado): ${snapshots}`);

  const examplesGoing = toDelete.filter((m) => EXAMPLE_NICKNAMES.includes(m.nickname)).length;
  if (examplesGoing) console.log(`      dos quais ${examplesGoing} sao do roster de exemplo`);

  if (keptDespiteAbsent.length > 0) {
    console.log(
      `\n    PRESERVADOS apesar de nao estarem na lista (tem login proprio):\n` +
        keptDespiteAbsent.map((m) => `      - ${m.nickname}`).join("\n"),
    );
  }

  if (keepingPlatformId.length > 0) {
    console.log(`\n    ID DA PLATAFORMA PRESERVADO (identidade EA ja resolvida):`);
    for (const { parsed, current } of keepingPlatformId) {
      console.log(
        `      - ${parsed.nickname}: mantem "${current.platformId}" e ignora "${parsed.platformId}" da lista`,
      );
    }
  }

  if (problems.length > 0) {
    console.log(`\n    PROBLEMAS NA LISTA (${problems.length}):`);
    problems.forEach((p) => console.log(`      - ${p}`));
  }

  const byRank = new Map<string, number>();
  for (const m of members)
    byRank.set(m.rankName || "(sem patente)", (byRank.get(m.rankName || "(sem patente)") ?? 0) + 1);
  console.log(`\n    patentes mapeadas:`);
  for (const [name, count] of [...byRank].sort((a, b) => b[1] - a[1])) {
    const points = name === "(sem patente)" ? 0 : pointsForRank(name);
    console.log(`      ${String(count).padStart(3)}x ${name.padEnd(22)} -> rankPoints ${points}`);
  }

  if (!APPLY) {
    console.log("\n  Para aplicar: pnpm db:import-roster --apply\n");
    return;
  }

  // Snapshots first: the ranking starts counting from this import, so no mocked
  // history survives it. Members are deleted after, cascading their own rows.
  const clearedSnapshots = await db.statSnapshot.deleteMany();
  const deleted = await db.member.deleteMany({ where: { id: { in: toDelete.map((m) => m.id) } } });

  let created = 0;
  let updated = 0;
  for (const m of members) {
    const current = byNick.get(m.nickname.toLowerCase());
    const keepPlatformId = current?.eaPersonaId !== null && current?.eaPersonaId !== undefined;

    if (current) {
      await db.member.update({
        where: { id: current.id },
        data: {
          platform: m.platform,
          rankPoints: m.rankPoints,
          active: true,
          collectWithoutLogin: true,
          // A resolved EA identity outranks an unverified value from the list.
          ...(keepPlatformId ? {} : { platformId: m.platformId }),
        },
      });
      updated += 1;
    } else {
      // `eaName` is deliberately NOT written from the list. The export holds the
      // console gamertag, which for 11 of the 23 unresolved members is not their
      // EA display name — copying it here would fill the field with a value we
      // already know does not resolve, and an admin looking at the panel could
      // not tell it apart from one someone actually confirmed. Blank means
      // "nobody has told us yet", and eaLookupName still falls back to the id.
      await db.member.create({
        data: {
          nickname: m.nickname,
          platform: m.platform,
          platformId: m.platformId,
          rankPoints: m.rankPoints,
          role: "member" satisfies MemberRole,
          active: true,
          collectWithoutLogin: true,
        },
      });
      created += 1;
    }
  }

  console.log(
    `\n  Pronto: ${created} criados, ${updated} atualizados, ${deleted.count} apagados, ` +
      `${clearedSnapshots.count} snapshots removidos.`,
  );
  const [total, collectable] = await Promise.all([
    db.member.count(),
    db.member.count({ where: { active: true, collectWithoutLogin: true } }),
  ]);
  console.log(`  Total no banco: ${total} membros, ${collectable} elegiveis a coleta sem login.`);
  console.log(
    `  A identidade EA de cada um e resolvida pelo coletor, no maximo 10 por ciclo de 10 min.\n`,
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
