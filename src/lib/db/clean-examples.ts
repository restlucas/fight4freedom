// Removes seed placeholder data from a database that already holds real
// members, without touching them. Run with:
//
//   pnpm db:clean-examples                          # dry run, prints the plan
//   pnpm db:clean-examples --apply                  # deletes everything below
//   pnpm db:clean-examples --incoherent-only --apply  # only target 3
//
// `--incoherent-only` exists because the two halves are different decisions: the
// corrupted snapshots are a bug backfill that is always safe to drop, while
// removing the example roster empties the public vitrine until the real members
// are registered, which is the clan's call and not a technical one.
//
// This exists because `pnpm db:seed` is all-or-nothing: it wipes every table it
// owns and rebuilds them, which would take the real members and the panel
// access with it (see `assertSafeToSeed` in seed.ts). Once the real roster is
// entered in /admin, this is how the scaffolding comes out.
//
// Three targets, each a placeholder by definition:
//   1. the invented roster (EXAMPLE_NICKNAMES) — their medals and snapshots go
//      with them through the FK cascade;
//   2. every `manual` snapshot — the seed is the only writer of that source
//      (manual stat entry was ruled out, docs/plano.md > Backlog), so all of
//      them are the fabricated numbers that would corrupt real month deltas;
//   3. `api` snapshots the coherence guard would now reject — the partially
//      zeroed rows the API served before `isIncoherentBucket` existed.

import { db } from "./index";
import { EXAMPLE_NICKNAMES } from "./example-roster";

const APPLY = process.argv.includes("--apply");
const INCOHERENT_ONLY = process.argv.includes("--incoherent-only");

/**
 * Rows the guard in `isIncoherentBucket` would drop today: zero kills next to a
 * positive K/D or a positive human-kill count. Kept as SQL because `extra` is
 * jsonb and this is a one-off backfill, not app logic.
 */
async function findIncoherentApiSnapshots() {
  return db.$queryRaw<{ id: string; nickname: string; captured_at: Date; kills: number }[]>`
    select s.id, m.nickname, s.captured_at, s.kills
    from stat_snapshot s
    join member m on m.id = s.member_id
    where s.source = 'api'
      and s.kills = 0
      and (
        coalesce((s.extra ->> 'killDeath')::numeric, 0) > 0
        or coalesce((s.extra ->> 'humanKills')::numeric, 0) > 0
      )
    order by s.captured_at
  `;
}

async function main() {
  const examples = INCOHERENT_ONLY
    ? []
    : await db.member.findMany({
        where: { nickname: { in: EXAMPLE_NICKNAMES } },
        select: { id: true, nickname: true, discordId: true },
      });

  // A real member could in theory have picked one of these nicknames and
  // claimed their invite. Never delete a claimed account from a name list.
  const claimed = examples.filter((m) => m.discordId !== null);
  const deletable = examples.filter((m) => m.discordId === null);
  if (claimed.length > 0) {
    console.warn(
      `  Preservados (nome de exemplo, mas com Discord vinculado): ${claimed
        .map((m) => m.nickname)
        .join(", ")}`,
    );
  }

  const manualCount = INCOHERENT_ONLY
    ? 0
    : await db.statSnapshot.count({ where: { source: "manual" } });
  const incoherent = await findIncoherentApiSnapshots();

  console.log(`\n  ${APPLY ? "Apagando" : "Dry run (nada sera apagado)"}:`);
  if (INCOHERENT_ONLY) {
    console.log("    (--incoherent-only: roster de exemplo e snapshots manual preservados)");
  } else {
    console.log(`    - membros de exemplo: ${deletable.length}`);
    console.log(`    - snapshots 'manual' (placeholders do seed): ${manualCount}`);
  }
  console.log(`    - snapshots 'api' incoerentes: ${incoherent.length}`);
  for (const row of incoherent) {
    console.log(`        ${row.nickname} @ ${row.captured_at.toISOString()} (kills=${row.kills})`);
  }

  if (!APPLY) {
    console.log("\n  Para aplicar: repita o comando com --apply\n");
    return;
  }

  // Members first: the cascade takes their memberMedal and statSnapshot rows,
  // so the counts printed above stay accurate for what remains.
  const removedMembers = await db.member.deleteMany({
    where: { id: { in: deletable.map((m) => m.id) } },
  });
  const removedManual = INCOHERENT_ONLY
    ? { count: 0 }
    : await db.statSnapshot.deleteMany({ where: { source: "manual" } });
  const removedIncoherent = await db.statSnapshot.deleteMany({
    where: { id: { in: incoherent.map((r) => r.id) } },
  });

  console.log(
    `\n  Pronto: ${removedMembers.count} membros, ${removedManual.count} snapshots manual, ` +
      `${removedIncoherent.count} snapshots api incoerentes.\n`,
  );

  const [remainingMembers, remainingSnapshots] = await Promise.all([
    db.member.count(),
    db.statSnapshot.count(),
  ]);
  console.log(`  Restam: ${remainingMembers} membros, ${remainingSnapshots} snapshots.\n`);
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
