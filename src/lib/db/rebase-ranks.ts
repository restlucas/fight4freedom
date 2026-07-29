// Re-bases the imported career balances onto the recalibrated rank ladder. Run with:
//
//   pnpm db:rebase-ranks           # dry run, prints every member's before/after
//   pnpm db:rebase-ranks --apply   # writes
//
// WHY THIS EXISTS. `rankPoints` came from the v1 site: `import-roster` read each
// member's rank NAME and stored the threshold that rank cost on the old ladder
// (Capitao = 2.500). On 2026-07-28 the ladder was recalibrated against measured
// data — 150 points per hour of play — and Capitao became 42.000. Deploying the
// new thresholds without this script demotes 57 of 99 members, because their
// stored balance was written in the old scale.
//
// WHAT IT DOES. For each member: read the rank their CURRENT balance holds on the
// OLD ladder (frozen below, deliberately not imported from src/lib/ranks.ts —
// that file now has the new numbers), then write the new threshold of the SAME
// rank, preserving whatever they had accrued above it. Nobody is promoted and
// nobody is demoted; only the scale changes.
//
// RUN IT ONCE, right after the deploy that carries the new thresholds. It is NOT
// idempotent by nature: a second pass would read the rebased balance against the
// old ladder and inflate it again (240.000 is Marechal on both, but 20.000 is
// Marechal on the old ladder and Segundo-Tenente on the new one). The guard below
// catches the common case, and the dry run prints everything before anything is
// written — read it.
//
// ORDER OF OPERATIONS. Deploy first, then run this. Both orders show a wrong
// state for the minutes in between, and this one is the harmless direction: the
// vitrine briefly shows lower ranks. Running the script first would show every
// member as Marechal on the old ladder, which is the version people screenshot.

import { RANKS } from "@/lib/ranks";

import { db } from "./index";

const APPLY = process.argv.includes("--apply");

/**
 * The ladder as it was until 2026-07-28. Frozen here on purpose: this script has
 * to read balances in the scale they were WRITTEN in, so importing the live RANKS
 * (already recalibrated) would make every member look like a Soldado and wipe the
 * roster's history.
 */
const LEGACY_THRESHOLDS: { name: string; threshold: number }[] = [
  { name: "Soldado", threshold: 0 },
  { name: "Cabo", threshold: 30 },
  { name: "Terceiro-Sargento", threshold: 90 },
  { name: "Segundo-Sargento", threshold: 200 },
  { name: "Primeiro-Sargento", threshold: 400 },
  { name: "Subtenente", threshold: 700 },
  { name: "Segundo-Tenente", threshold: 1_100 },
  { name: "Primeiro-Tenente", threshold: 1_700 },
  { name: "Capitão", threshold: 2_500 },
  { name: "Major", threshold: 3_600 },
  { name: "Tenente-Coronel", threshold: 5_000 },
  { name: "Coronel", threshold: 7_000 },
  { name: "General de Brigada", threshold: 9_500 },
  { name: "General de Divisão", threshold: 12_500 },
  { name: "General de Exército", threshold: 16_000 },
  { name: "Marechal", threshold: 20_000 },
];

function legacyRankFor(points: number): { name: string; threshold: number } {
  let current = LEGACY_THRESHOLDS[0];
  for (const rank of LEGACY_THRESHOLDS) {
    if (points >= rank.threshold) current = rank;
    else break;
  }
  return current;
}

function newThresholdFor(name: string): number {
  const rank = RANKS.find((r) => r.name === name);
  if (!rank) throw new Error(`patente "${name}" nao existe na escada nova`);
  return rank.threshold;
}

async function main() {
  const members = await db.member.findMany({
    select: { id: true, nickname: true, rankPoints: true },
    orderBy: { rankPoints: "desc" },
  });

  // GUARD. Before the rebase, the roster sits on old thresholds, so members exist
  // between 1 and the new Cabo (30 and 90 were two whole ranks). Afterwards that
  // band is empty. Finding it empty means this very likely already ran, and a
  // second pass would inflate every balance a full ladder.
  const newCabo = RANKS[1].threshold;
  const inLegacyBand = members.filter((m) => m.rankPoints > 0 && m.rankPoints < newCabo);
  if (inLegacyBand.length === 0) {
    console.error(
      `\n>> ABORTADO: nenhum membro tem saldo entre 1 e ${newCabo} pontos.\n` +
        "   Essa faixa e a assinatura de um roster AINDA na escada antiga, entao a\n" +
        "   ausencia dela indica que o rebase ja rodou. Rodar de novo inflaria todos\n" +
        "   os saldos em uma escada inteira. Se você tem certeza do contrario,\n" +
        "   confira os saldos no painel antes de mexer.\n",
    );
    process.exitCode = 1;
    return;
  }

  const plan = members.map((m) => {
    const legacy = legacyRankFor(m.rankPoints);
    // Anything earned above the rank's floor is carried over instead of being
    // rounded away, so a balance the collector already moved is not lost.
    const surplus = m.rankPoints - legacy.threshold;
    return {
      ...m,
      rank: legacy.name,
      after: newThresholdFor(legacy.name) + surplus,
      surplus,
    };
  });

  const byRank = new Map<string, { count: number; before: number; after: number }>();
  for (const p of plan) {
    const entry = byRank.get(p.rank) ?? { count: 0, before: p.rankPoints, after: p.after };
    entry.count += 1;
    byRank.set(p.rank, entry);
  }

  console.log(`\n${APPLY ? "APLICANDO" : "DRY RUN"} — rebase de ${plan.length} membros\n`);
  console.log("  patente mantida             membros   antes  ->    depois");
  for (const rank of LEGACY_THRESHOLDS) {
    const entry = byRank.get(rank.name);
    if (!entry) continue;
    console.log(
      `  ${rank.name.padEnd(26)} ${String(entry.count).padStart(5)}   ` +
        `${String(entry.before).padStart(6)}  ->  ${String(entry.after).padStart(8)}`,
    );
  }

  const withSurplus = plan.filter((p) => p.surplus > 0);
  if (withSurplus.length > 0) {
    console.log(
      `\n  ${withSurplus.length} membro(s) com saldo acima do piso da patente ` +
        "(pontos que a coleta já creditou), preservado no rebase:",
    );
    for (const p of withSurplus) {
      console.log(`    ${p.nickname.padEnd(24)} +${p.surplus} pts`);
    }
  }

  if (!APPLY) {
    console.log("\n  Nada foi escrito. Rode com --apply para aplicar.\n");
    return;
  }

  // Sequential rather than a transaction of 99 updates: each row is independent,
  // and a partial run is recoverable — re-running would be blocked by the guard,
  // so the safe recovery is to fix the remaining rows by hand from this output.
  for (const p of plan) {
    if (p.after === p.rankPoints) continue;
    await db.member.update({ where: { id: p.id }, data: { rankPoints: p.after } });
  }
  console.log(
    `\n  OK: ${plan.filter((p) => p.after !== p.rankPoints).length} membro(s) atualizado(s).\n`,
  );
}

main()
  .then(() => db.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await db.$disconnect();
    process.exitCode = 1;
  });
