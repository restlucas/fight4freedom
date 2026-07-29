import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { IdentityAccountCard } from "@/features/identity/components/identity-account-card";
import { IdentityConfirm } from "@/features/identity/components/identity-confirm";
import { getIdentityState } from "@/features/identity/lib/queries";
import { getSessionProfile } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Confirmar conta",
  robots: { index: false, follow: false },
};

// Never cached: it reads the live EA source and its whole purpose is to reflect a
// state the member is about to change.
export const dynamic = "force-dynamic";

export default async function ConfirmarContaPage() {
  const profile = await getSessionProfile();
  // Signed out, or signed in without a clan member behind it. Either way there is
  // nothing here to confirm.
  if (!profile?.memberId) redirect("/entrar?erro=restrito&next=/confirmar-conta");

  const state = await getIdentityState(profile.memberId);
  if (!state) redirect("/");

  const canReview =
    Boolean(state.boundCard) &&
    (state.lastClaim?.declaredName?.length ?? 0) >= 2 &&
    (state.lastClaim?.declaredUsername?.length ?? 0) >= 2;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <header>
        <h1 className="font-heading text-3xl font-bold">Confirme sua conta da EA</h1>
        <p className="text-muted-foreground mt-2">
          É o que liga o seu perfil aqui aos seus stats de Battlefield 6. Sem isso, a coleta pode
          acabar lendo a conta de outra pessoa com nome parecido — já aconteceu, e é por isso que
          agora quem confirma é você.
        </p>
      </header>

      <div className="mt-8">
        {state.confirmedAt ? (
          // Already settled. Read-only from here: the member's own screen must not
          // offer a change only an admin can make.
          <div className="space-y-4">
            <div className="bg-card rounded-xl border p-6">
              <h2 className="font-heading text-xl font-bold">Sua conta já está confirmada</h2>
              <p className="text-muted-foreground mt-2 text-sm">
                Confirmada em{" "}
                {new Intl.DateTimeFormat("pt-BR", {
                  dateStyle: "long",
                  timeZone: "America/Sao_Paulo",
                }).format(state.confirmedAt)}
                . Para trocar a conta vinculada, fale com um admin.
              </p>
              <Button asChild className="mt-5">
                <Link href={`/membros/${state.memberId}`}>Ver meu perfil</Link>
              </Button>
            </div>
            {state.boundCard ? (
              <IdentityAccountCard card={state.boundCard} lastPlayedAt={state.lastPlayedAt} />
            ) : null}
          </div>
        ) : (
          <IdentityConfirm
            memberId={state.memberId}
            nickname={state.nickname}
            boundCard={state.boundCard}
            boundIdentityExists={state.boundIdentityExists}
            lastPlayedAt={state.lastPlayedAt}
            prefill={{
              eaName: state.lastClaim?.declaredName ?? "",
              eaUsername: state.lastClaim?.declaredUsername ?? "",
            }}
            canReview={canReview}
          />
        )}
      </div>
    </main>
  );
}
