// Fills every member's GAME profile in one go. Run with:
//
//   pnpm db:sync-game-profiles
//
// The collector refreshes these too, but caps itself at WORKER_PROFILE_LIMIT (10)
// per cycle so one request per member cannot eat the clock the stats sweep needs.
// That cap is right for the steady state — a level moves every few dozen hours of
// play — and wrong right after the feature ships: at 10 per cycle on the 20-minute
// cadence, 99 members take ten cycles, and any cycle where the source is slow skips
// the pass entirely. Measured on 2026-07-29, three real cycles left 9 of 99 members
// with a rank, so the profile panel was blank for 90 % of the roster.
//
// Same politeness as the collector: one request in flight at a time, never parallel,
// because the API is a free community service with no published rate limit. Each call
// is 14 KB and answered in well under a second warm.
//
// No dry-run flag, for the same reason `db:resolve-identities` has none: a dry run
// would spend the same 99 requests and write nothing. The operation is idempotent and
// touches display-only columns.

import { gametoolsProvider } from "@/lib/stats/gametools";

import { db } from "./index";

async function main() {
  const members = await db.member.findMany({
    // Same eligibility as the collector, so this never reads someone the collection
    // would ignore anyway.
    where: {
      active: true,
      statsPaused: false,
      eaPersonaId: { not: null },
      eaNucleusId: { not: null },
      OR: [{ discordId: { not: null } }, { collectWithoutLogin: true }],
    },
    select: { id: true, nickname: true, eaPersonaId: true, eaNucleusId: true },
    // Alphabetical is fine here, unlike in the collector: this run has no budget to
    // be cut short by, so there is no queue to rotate.
    orderBy: { nickname: "asc" },
  });

  console.info(`[perfis] ${members.length} membro(s) elegivel(is)`);

  let read = 0;
  let empty = 0;
  let failed = 0;

  for (const member of members) {
    let profile = null;
    try {
      profile = await gametoolsProvider.fetchGameProfile({
        personaId: member.eaPersonaId!,
        nucleusId: member.eaNucleusId!,
      });
    } catch (error) {
      console.warn(`  ! ${member.nickname}: ${error instanceof Error ? error.message : error}`);
    }
    // A NULL COUNTS AS A FAILURE, and it is the common one: `fetchGameProfile` catches
    // its own timeouts and returns null rather than throwing, so counting only the
    // catch above reported "0 falhas" on a run that had lost 17 members to timeouts.
    // The number is the reason to re-run, so it has to be true.
    if (!profile) failed += 1;

    // Stamped on every attempt, exactly like the collector's pass, so a member whose
    // profile always fails does not keep the front of that queue forever.
    await db.member.update({
      where: { id: member.id },
      data: {
        gameProfileReadAt: new Date(),
        // Written ONLY on success: `fetchGameProfile` cannot tell "the request died"
        // from "this account has no rank", so its null is not an answer, and writing
        // it would erase a rank we already hold.
        ...(profile
          ? {
              gameRankName: profile.rankName,
              gameRankLevel: profile.rankLevel,
              gameRankImageUrl: profile.rankImageUrl,
              badgeCount: profile.badges,
              dogTagCount: profile.dogTags,
              competitiveRankName: profile.competitive?.rankName ?? null,
              competitiveRankMode: profile.competitive?.mode ?? null,
            }
          : {}),
      },
    });

    if (!profile) continue;
    if (profile.rankName) {
      read += 1;
      console.info(
        `  ${member.nickname}: ${profile.rankName} (nv ${profile.rankLevel ?? "?"}), ` +
          `${profile.badges ?? "?"} insignias, ${profile.dogTags ?? "?"} dog tags`,
      );
    } else {
      // Answered, with no rank in it. Distinct from a failure: nothing to retry.
      empty += 1;
    }
  }

  console.info(
    `\n[perfis] ${read} com patente, ${empty} sem patente na resposta, ${failed} nao respondido(s)`,
  );
  if (failed > 0) {
    // Idempotent, so this is the whole remedy: the ones that answered are skipped in
    // substance (they are re-read and rewritten with the same values) and the ones
    // that timed out get another chance.
    console.info("[perfis] rode de novo para tentar os que nao responderam");
  }
  console.info("[perfis] purgue o cache da vitrine ou espere o TTL de 300 s");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
