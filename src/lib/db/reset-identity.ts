// Puts a member back in front of the identity screen. Run with:
//
//   pnpm db:reset-identity "<nick>"            # só o estado de identidade
//   pnpm db:reset-identity "<nick>" --invite   # + desvincula o login e gera convite
//
// WHY IT EXISTS. Confirming is a one-way door for the member: after
// `identityConfirmedAt` is set, /confirmar-conta becomes a read-only receipt and
// only an admin can change the binding. That is the right product rule and it makes
// the flow impossible to test twice — which is how the first version of this test
// setup ended up being a script that DELETED a member and everything attached to
// them (a snapshot, six medals and 750 career points, on the production database).
//
// So this is the deliberately boring alternative. NOTHING here is destructive
// beyond the identity state itself:
//
//   - snapshots, medals, career points and the member id are never touched, so the
//     /membros URL and the monthly ranking survive;
//   - `identityClaim` rows ARE deleted, because they are the attempt log of the run
//     being redone and keeping them would make the admin queue read as a backlog;
//   - `--invite` unlinks the Discord login (profile.memberId and member.discordId)
//     and issues a fresh invite, which is the only way to exercise the full
//     convite -> Discord -> callback -> gate path. The `profile` row itself, and its
//     `isAdmin`, are left alone: panel access can never be lost by running this.

import { generateInviteToken, hashInviteToken, inviteExpiresAt, inviteUrl } from "../auth/invite";
import { db } from "./index";

async function main() {
  const nickname = process.argv[2];
  const alsoInvite = process.argv.includes("--invite");

  if (!nickname) {
    console.error('\n  Passe o nick: pnpm db:reset-identity "<nick>" [--invite]\n');
    process.exitCode = 1;
    return;
  }

  const member = await db.member.findFirst({
    where: { nickname: { contains: nickname, mode: "insensitive" } },
    select: {
      id: true,
      nickname: true,
      eaName: true,
      eaUsername: true,
      eaPersonaId: true,
      identityConfirmedAt: true,
      identityHelpRequestedAt: true,
      discordId: true,
      profiles: { select: { id: true, isAdmin: true } },
      _count: { select: { identityClaims: true, snapshots: true, medals: true } },
    },
  });

  if (!member) {
    console.error(`\n  Nenhum membro parecido com "${nickname}".\n`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n  ${member.nickname} (${member.id})`);
  console.log(
    `    antes: confirmado=${member.identityConfirmedAt ?? "não"} ` +
      `ajuda=${member.identityHelpRequestedAt ?? "não"} tentativas=${member._count.identityClaims}`,
  );
  console.log(
    `    preservados: ${member._count.snapshots} snapshot(s), ${member._count.medals} medalha(s)`,
  );

  await db.$transaction([
    db.identityClaim.deleteMany({ where: { memberId: member.id } }),
    db.member.update({
      where: { id: member.id },
      data: {
        identityConfirmedAt: null,
        identityHelpRequestedAt: null,
        statsPaused: false,
        statsPausedReason: null,
        ...(alsoInvite ? { discordId: null } : {}),
      },
    }),
  ]);

  // Which branch of the screen the member will land on, printed because it is the
  // thing being tested and it depends on data, not on a flag.
  const branch = member.eaPersonaId
    ? member.eaUsername
      ? "REVIEW (card da conta vinculada, um clique para confirmar)"
      : "DECLARE (tem persona mas falta o username para registrar a confirmação)"
    : "DECLARE (formulário: nada vinculado)";
  console.log(`    depois: não confirmado -> a tela abre em ${branch}`);

  if (!alsoInvite) {
    console.log("\n  Pronto. Recarregue o site com a sessão atual para cair no gate.\n");
    return;
  }

  await db.$transaction([
    // The profile row and its isAdmin stay; only the link to the member is cut.
    db.profile.updateMany({ where: { memberId: member.id }, data: { memberId: null } }),
    db.memberInvite.deleteMany({ where: { memberId: member.id, usedAt: null } }),
  ]);

  const token = generateInviteToken();
  await db.memberInvite.create({
    data: {
      memberId: member.id,
      tokenHash: hashInviteToken(token),
      grantsAdmin: member.profiles.some((p) => p.isAdmin),
      discordUsername: member.nickname,
      expiresAt: inviteExpiresAt(new Date()),
    },
  });

  console.log(
    `    login desvinculado: ${member.profiles.map((p) => p.id).join(", ") || "(nenhum profile)"}`,
  );
  console.log(`\n  CONVITE (uso único, 7 dias):`);
  console.log(
    `  ${inviteUrl(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000", token)}\n`,
  );
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (error) => {
    console.error("\n  Falhou:", error);
    await db.$disconnect();
    process.exitCode = 1;
  });
