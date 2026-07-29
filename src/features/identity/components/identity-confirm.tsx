"use client";

// The first-login identity screen.
//
// TWO ENTRY STATES, and keeping them apart is most of the value:
//
//   REVIEW  — the member already has an EA account bound (an admin registered a
//             name and it resolved). They are shown that account's own numbers and
//             asked one question. For the 72 members whose binding is already right
//             this is the whole interaction: one click.
//   DECLARE — nothing bound, or the member said "that is not me". Now they type a
//             name, we search live, and they pick from real candidates.
//
// The screen NEVER auto-accepts, not even when the search returns exactly one
// account. That is deliberate and it is the bug this whole feature exists to kill:
// silently binding a single search hit is how ten members ended up wearing
// strangers' careers (docs/api-gametools.md §11).

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IdentityCard } from "@/lib/stats/provider";

import {
  confirmIdentityAction,
  requestIdentityHelpAction,
  searchIdentityAction,
} from "../lib/actions";
import { IdentityAccountCard } from "./identity-account-card";

interface IdentityConfirmProps {
  memberId: string;
  nickname: string;
  /** The account bound right now, if the source answered for it. */
  boundCard: IdentityCard | null;
  /** True when a binding exists but its data could not be read just now. */
  boundIdentityExists: boolean;
  lastPlayedAt: Date | null;
  /** Prefill for the two fields, from the last attempt or the admin's entry. */
  prefill: { eaName: string; eaUsername: string };
  /** Whether REVIEW is possible: we need both labels to record the confirmation. */
  canReview: boolean;
}

export function IdentityConfirm({
  memberId,
  nickname,
  boundCard,
  boundIdentityExists,
  lastPlayedAt,
  prefill,
  canReview,
}: IdentityConfirmProps) {
  const [mode, setMode] = useState<"review" | "declare">(canReview ? "review" : "declare");
  // Held in React state, not left to the DOM, because three sibling forms need
  // these two values and forms cannot nest.
  const [eaName, setEaName] = useState(prefill.eaName);
  const [eaUsername, setEaUsername] = useState(prefill.eaUsername);

  const [searchState, search, searching] = useActionState(searchIdentityAction, null);
  const [confirmState, confirm, confirming] = useActionState(confirmIdentityAction, null);
  const [helpState, requestHelp, requestingHelp] = useActionState(requestIdentityHelpAction, null);

  // Done. Terminal on purpose: from here only an admin can change the binding, so
  // re-rendering the form would offer something that no longer works.
  if (confirmState?.ok) {
    return (
      <div className="bg-card rounded-xl border p-8 text-center">
        <h2 className="font-heading text-2xl font-bold">Conta confirmada</h2>
        <p className="text-muted-foreground mt-3">
          Pronto, {confirmState.data.nickname}. Seus stats passam a ser coletados no próximo ciclo,
          que roda a cada 20 minutos.
        </p>
        <p className="text-muted-foreground mt-2 text-sm">
          Precisa trocar a conta vinculada? Fale com um admin.
        </p>
        <Button asChild className="mt-6">
          <Link href={`/membros/${memberId}`}>Ver meu perfil</Link>
        </Button>
      </div>
    );
  }

  if (helpState?.ok) {
    return (
      <div className="bg-card rounded-xl border p-8 text-center">
        <h2 className="font-heading text-2xl font-bold">Pedido enviado</h2>
        <p className="text-muted-foreground mt-3">
          Um admin vai resolver sua conta manualmente. Você já pode usar o site normalmente; seus
          stats entram assim que o vínculo for corrigido.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/">Ir para a home</Link>
        </Button>
      </div>
    );
  }

  const candidates = searchState?.ok ? searchState.data.candidates : [];
  const notice = searchState?.ok ? searchState.data.notice : null;
  const formError = searchState && !searchState.ok ? searchState.error : null;
  const confirmError = confirmState && !confirmState.ok ? confirmState.error : null;
  const fieldErrors = searchState && !searchState.ok ? searchState.fieldErrors : undefined;

  /** Hidden inputs every confirm/help form needs. */
  const carried = (
    <>
      <input type="hidden" name="eaName" value={eaName} />
      <input type="hidden" name="eaUsername" value={eaUsername} />
    </>
  );

  return (
    <div className="space-y-6">
      {confirmError ? (
        <p
          role="alert"
          className="border-destructive/50 bg-destructive/10 text-destructive rounded-lg border px-4 py-3 text-sm"
        >
          {confirmError}
        </p>
      ) : null}

      {mode === "review" && boundCard ? (
        <section>
          <h2 className="font-heading text-xl font-bold">Esta é a sua conta?</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Foi a conta que registramos para <strong className="text-foreground">{nickname}</strong>
            . Confira os números antes de confirmar: se eles não parecerem seus, a conta é de outra
            pessoa com nome parecido.
          </p>

          <IdentityAccountCard
            card={boundCard}
            lastPlayedAt={lastPlayedAt}
            className="mt-4"
            action={
              <div className="flex flex-col gap-2 sm:flex-row">
                <form action={confirm} className="sm:flex-1">
                  {carried}
                  <input type="hidden" name="personaId" value={boundCard.identity.personaId} />
                  <input type="hidden" name="nucleusId" value={boundCard.identity.nucleusId} />
                  <input
                    type="hidden"
                    name="resolvedUsername"
                    value={boundCard.identity.username ?? ""}
                  />
                  <Button type="submit" className="w-full" disabled={confirming || boundCard.empty}>
                    {confirming ? "Confirmando..." : "Sim, é a minha conta"}
                  </Button>
                </form>
                <Button
                  type="button"
                  variant="outline"
                  className="sm:flex-1"
                  onClick={() => setMode("declare")}
                >
                  Não é a minha conta
                </Button>
              </div>
            }
          />
        </section>
      ) : null}

      {mode === "declare" ? (
        <section>
          <h2 className="font-heading text-xl font-bold">Informe sua conta da EA</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            A busca da EA compara o <strong className="text-foreground">nome inteiro</strong>, então
            tags do clã atrapalham: se no jogo você aparece como “F4F_Fulano”, informe apenas
            “Fulano”. Acentos e maiúsculas contam.
          </p>

          {boundIdentityExists && !boundCard ? (
            <p className="text-muted-foreground bg-muted/40 mt-4 rounded-lg border px-4 py-3 text-sm">
              Já existe uma conta vinculada a você, mas a fonte de stats não respondeu agora, então
              não conseguimos mostrar os números dela. Você pode recarregar a página em alguns
              segundos ou informar sua conta abaixo.
            </p>
          ) : null}

          <form action={search} className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="eaName">Nome da conta EA</Label>
              <Input
                id="eaName"
                name="eaName"
                value={eaName}
                onChange={(event) => setEaName(event.target.value)}
                autoComplete="off"
                required
                aria-describedby="eaName-help"
              />
              <p id="eaName-help" className="text-muted-foreground text-xs">
                É o EA ID, o nome que aparece no topo do seu perfil na EA. Pode ter espaços.
              </p>
              {fieldErrors?.eaName ? (
                <p className="text-destructive text-xs">{fieldErrors.eaName[0]}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="eaUsername">Username da EA</Label>
              <Input
                id="eaUsername"
                name="eaUsername"
                value={eaUsername}
                onChange={(event) => setEaUsername(event.target.value)}
                autoComplete="off"
                required
                aria-describedby="eaUsername-help"
              />
              <p id="eaUsername-help" className="text-muted-foreground text-xs">
                Fica nas configurações da conta EA, separado do EA ID. Serve para diferenciar duas
                contas com o mesmo nome.
              </p>
              {fieldErrors?.eaUsername ? (
                <p className="text-destructive text-xs">{fieldErrors.eaUsername[0]}</p>
              ) : null}
            </div>

            {formError ? (
              <p role="alert" className="text-destructive text-sm">
                {formError}
              </p>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" disabled={searching} className="sm:flex-1">
                {searching ? "Buscando na EA..." : "Buscar minha conta"}
              </Button>
              {canReview ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="sm:flex-1"
                  onClick={() => setMode("review")}
                >
                  Voltar para a conta registrada
                </Button>
              ) : null}
            </div>
          </form>
        </section>
      ) : null}

      {notice ? <p className="bg-muted/40 rounded-lg border px-4 py-3 text-sm">{notice}</p> : null}

      {candidates.length > 0 ? (
        <section>
          <h3 className="font-heading text-lg font-bold">
            {candidates.length === 1 ? "Encontramos esta conta" : "Escolha a sua conta"}
          </h3>
          <div className="mt-3 space-y-3">
            {candidates.map((candidate) => (
              <IdentityAccountCard
                key={candidate.identity.personaId}
                card={candidate}
                action={
                  <form action={confirm}>
                    {carried}
                    <input type="hidden" name="personaId" value={candidate.identity.personaId} />
                    <input type="hidden" name="nucleusId" value={candidate.identity.nucleusId} />
                    <input
                      type="hidden"
                      name="resolvedUsername"
                      value={candidate.identity.username ?? ""}
                    />
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={confirming || candidate.empty}
                    >
                      {candidate.empty ? "Conta sem dados de BF6" : "Sou eu, vincular esta conta"}
                    </Button>
                  </form>
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="border-t pt-6">
        <h3 className="font-heading text-sm font-bold">Não consegue achar sua conta?</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Alguns nomes realmente não aparecem na busca da EA. Avise um admin e ele resolve
          manualmente — você continua usando o site normalmente enquanto isso.
        </p>
        <form action={requestHelp} className="mt-3">
          {carried}
          <Button type="submit" variant="outline" disabled={requestingHelp}>
            {requestingHelp ? "Enviando..." : "Não consegui, pedir ajuda a um admin"}
          </Button>
        </form>
        {helpState && !helpState.ok ? (
          <p role="alert" className="text-destructive mt-2 text-sm">
            {helpState.error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
