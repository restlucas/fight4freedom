import { DiscordLogoIcon } from "@phosphor-icons/react/dist/ssr";
import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { startInviteLogin } from "@/features/auth/lib/actions";
import {
  hashInviteToken,
  INVITE_STATE_MESSAGE,
  inviteState,
} from "@/lib/auth/invite";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Convite",
  robots: { index: false, follow: false },
};

// Never cached: the invite state changes the moment it is claimed.
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

export default async function InvitePage({ params }: Params) {
  const { token } = await params;

  // Looked up by hash — the plaintext token is never stored.
  const invite = await db.memberInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    select: {
      expiresAt: true,
      usedAt: true,
      grantsAdmin: true,
      member: { select: { nickname: true } },
    },
  });

  const state = inviteState(invite, new Date());
  const claimable = state === "valid" && invite !== null;
  const errorMessage = claimable
    ? null
    : (INVITE_STATE_MESSAGE[state as Exclude<typeof state, "valid">] ??
      INVITE_STATE_MESSAGE.unknown);

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center px-4 py-16">
      <div className="bg-card rounded-xl border p-8 text-center">
        {claimable && invite ? (
          <>
            <h1 className="font-heading text-2xl font-bold">
              Bem-vindo ao Fight 4 Freedom
            </h1>
            <p className="text-muted-foreground mt-3">
              Você foi convidado como{" "}
              <strong className="text-foreground">
                {invite.member.nickname}
              </strong>
              . Entre com o Discord para confirmar e vincular sua conta.
            </p>

            {invite.grantsAdmin ? (
              <p className="text-primary mt-4 flex items-center justify-center gap-1.5 text-sm">
                <ShieldCheck className="size-4" />
                Este convite concede acesso administrativo.
              </p>
            ) : null}

            <form action={startInviteLogin} className="mt-6">
              <input type="hidden" name="token" value={token} />
              <Button type="submit" size="lg" className="w-full gap-2">
                <DiscordLogoIcon size={20} weight="fill" />
                Entrar com Discord
              </Button>
            </form>

            <p className="text-muted-foreground mt-4 text-xs">
              O convite é de uso único e expira em até 7 dias.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-heading text-2xl font-bold">Convite inválido</h1>
            <p className="text-muted-foreground mt-3">{errorMessage}</p>
          </>
        )}
      </div>
    </main>
  );
}
