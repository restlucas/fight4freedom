// Drains the EA identity backlog in one go. Run with:
//
//   pnpm db:resolve-identities
//
// The collector resolves identities too, but caps itself per run
// (ROUTE_IDENTITY_LIMIT / WORKER_IDENTITY_LIMIT) so a backlog cannot eat the clock
// its sweep needs. Those caps are right for the steady state — a couple of new
// members trickling in — and wrong for a bulk import: at 25 per cycle on the
// 20-minute cadence, 98 members take four cycles, over an hour of waiting.
//
// This script has no such budget, so it walks the whole backlog at once. Same
// politeness as the collector: one request in flight at a time, never parallel,
// because the API is a free community service with no published rate limit.
//
// There is deliberately NO dry-run flag. A dry run would spend the exact same 98
// requests on that API and write nothing, which is the one outcome worth avoiding.
// The operation is additive and idempotent: it only fills blank identity fields,
// and re-running skips whatever already resolved.

import { gametoolsProvider } from "@/lib/stats/gametools";
import { eaLookupName } from "@/lib/stats/identity";

import { db } from "./index";

async function main() {
  const pending = await db.member.findMany({
    // Same eligibility as the collector, so this never resolves someone the
    // collection would ignore anyway.
    where: {
      active: true,
      eaPersonaId: null,
      OR: [{ discordId: { not: null } }, { collectWithoutLogin: true }],
      // Something to search for: the EA name, or the platform id as fallback.
      AND: [{ OR: [{ eaName: { not: null } }, { platformId: { not: null } }] }],
    },
    select: {
      id: true,
      nickname: true,
      eaName: true,
      eaUsername: true,
      platformId: true,
      platform: true,
    },
    orderBy: { nickname: "asc" },
  });

  if (pending.length === 0) {
    console.log("\n  Nenhuma identidade pendente.\n");
    return;
  }

  console.log(`\n  Resolvendo ${pending.length} identidades, uma por vez...\n`);
  const started = Date.now();
  const failed: { nickname: string; lookup: string; platform: string }[] = [];
  let resolved = 0;

  for (const [index, member] of pending.entries()) {
    const at = `[${String(index + 1).padStart(3)}/${pending.length}]`;
    const lookup = eaLookupName(member)!;
    try {
      const identity = await gametoolsProvider.searchPlayer(lookup, member.eaUsername);
      if (!identity) {
        failed.push({ nickname: member.nickname, lookup, platform: member.platform });
        console.log(`  ${at} ${member.nickname.padEnd(24)} NAO ENCONTRADO ("${lookup}")`);
        continue;
      }
      await db.member.update({
        where: { id: member.id },
        data: {
          eaPersonaId: identity.personaId,
          eaNucleusId: identity.nucleusId,
          ...(member.eaUsername ? {} : { eaUsername: identity.username }),
        },
      });
      resolved += 1;
      console.log(`  ${at} ${member.nickname.padEnd(24)} ok`);
    } catch (error) {
      failed.push({ nickname: member.nickname, lookup, platform: member.platform });
      console.log(
        `  ${at} ${member.nickname.padEnd(24)} ERRO: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`\n  Resolvidas: ${resolved}/${pending.length} em ${seconds}s.`);

  if (failed.length > 0) {
    // These are the members who will carry the "Stats pendentes" badge. The name
    // is almost always the cause: on Xbox and PSN the export holds the gamertag,
    // while the search matches the EA display name, and the two differ. Measured
    // 2026-07-28: 11 of the 23 unresolved members are console players in exactly
    // that situation. Filling "Nome da EA" in the panel is the fix.
    console.log(`\n  NAO ENCONTRADOS NA EA (${failed.length}) — preencher "Nome da EA" no painel:`);
    for (const f of failed) {
      console.log(
        `    - ${f.nickname.padEnd(24)} ${f.platform.padEnd(5)} buscou por: "${f.lookup}"`,
      );
    }
    const byPlatform = failed.reduce<Record<string, number>>((acc, f) => {
      acc[f.platform] = (acc[f.platform] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`\n    por plataforma: ${JSON.stringify(byPlatform)}`);
  }
  console.log("");
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
