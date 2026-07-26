// Issues (or re-issues) the admin bootstrap invite and prints its link.
// Run with: pnpm invite:admin [nickname]
//
// Why this exists: invite tokens are stored HASHED (src/lib/auth/invite.ts), so
// a lost link cannot be recovered — it can only be replaced. Without this, the
// only way back in is re-running the seed, which wipes every table. And the
// panel itself cannot help: granting admin requires being admin already.
//
// Safe to run repeatedly. It supersedes the member's unused invites (same rule
// as createInviteAction) and touches nothing else.

import { generateInviteToken, hashInviteToken, inviteExpiresAt, inviteUrl } from "../auth/invite";
import { db } from "./index";

async function bootstrapInvite() {
  const nickname = process.argv[2];

  const member = nickname
    ? await db.member.findFirst({
        where: { nickname },
        select: { id: true, nickname: true, profiles: { select: { isAdmin: true } } },
      })
    : // No nickname given: the clan admin is the intended target.
      await db.member.findFirst({
        where: { role: "admin" },
        orderBy: { joinedAt: "asc" },
        select: { id: true, nickname: true, profiles: { select: { isAdmin: true } } },
      });

  if (!member) {
    console.error(
      nickname
        ? `Membro "${nickname}" não encontrado.`
        : "Nenhum membro com cargo admin. Passe o nick: pnpm invite:admin <nick>",
    );
    process.exitCode = 1;
    return;
  }

  const token = generateInviteToken();
  await db.$transaction([
    // Only one live invite per member: this link supersedes any previous one.
    db.memberInvite.deleteMany({ where: { memberId: member.id, usedAt: null } }),
    db.memberInvite.create({
      data: {
        memberId: member.id,
        tokenHash: hashInviteToken(token),
        grantsAdmin: true,
        discordUsername: member.nickname,
        expiresAt: inviteExpiresAt(new Date()),
      },
    }),
  ]);

  const url = inviteUrl(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000", token);

  console.log(`\n  Convite de admin para ${member.nickname} (uso único, 7 dias):`);
  console.log(`  ${url}\n`);

  if (member.profiles.length > 0) {
    console.log(
      "  Obs.: este membro já tem conta vinculada. Claimar de novo com a MESMA\n" +
        "  conta do Discord só promove a admin; outra conta é recusada.\n",
    );
  }
}

bootstrapInvite()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (err) => {
    console.error("Falha ao gerar o convite:", err);
    await db.$disconnect();
    process.exitCode = 1;
  });
