"use server";

// The member's own identity actions: declare a name, confirm an account, or give
// up and ask an admin.
//
// WHY THIS EXISTS. Until now an EA account was bound by RESOLVING A NAME an admin
// typed, and nothing ever asked whether the account found was the right person's.
// On 2026-07-28 that cost us ten members bound to accounts that existed and were
// not theirs, one of them scoring 86.914 ranking points out of a stranger's career
// (docs/api-gametools.md §11). The fix is not a better heuristic — there isn't
// one, `displayName` is neither unique nor case-normalised — it is asking the one
// person on earth who knows the answer, while showing them numbers they recognise.
//
// Every action here writes ONLY to the caller's own member row: `requireOwnMemberId`
// takes the member from the session and never from the form, which is the
// difference between "confirm my account" and "rebind anyone's".

import { revalidatePath } from "next/cache";

import { actionError, fieldErrorsOf, type ActionResult } from "@/lib/action-result";
import { requireOwnMemberId } from "@/lib/auth/session";
import { CACHE_TAG, revalidateVitrine } from "@/lib/cache";
import { db } from "@/lib/db";
import { gametoolsProvider } from "@/lib/stats/gametools";
import type { IdentityCard } from "@/lib/stats/provider";

import { confirmIdentitySchema, identityClaimSchema } from "./schemas";

/** What the search hands back to the screen. */
export type IdentitySearchResult = {
  candidates: IdentityCard[];
  /**
   * Why the list is empty or unhelpful, in the member's own language. Present
   * alongside candidates, never instead of them: an ambiguous search has both a
   * list AND something to explain.
   */
  notice: string | null;
};

const ALREADY_CONFIRMED =
  "Sua conta já foi confirmada. Para trocar a conta da EA vinculada, fale com um admin.";

/**
 * The gate every member-run action starts with.
 *
 * Confirmation is a ONE-WAY DOOR for the member (clan owner's decision,
 * 2026-07-29): after it, only an admin changes the binding. The reason is that a
 * confirmed binding is the only thing in the system that carries a human's word,
 * and letting the same screen overwrite it later would put it back to being a
 * guess — this time one nobody reviewed.
 */
async function requireUnconfirmedMember(): Promise<
  { memberId: string } | { error: ActionResult<never> }
> {
  const memberId = await requireOwnMemberId();
  const member = await db.member.findUnique({
    where: { id: memberId },
    select: { identityConfirmedAt: true },
  });
  if (!member) return { error: actionError("Membro não encontrado.") };
  if (member.identityConfirmedAt) return { error: actionError(ALREADY_CONFIRMED) };
  return { memberId };
}

/**
 * Searches EA for the declared name and returns the candidates with their cards.
 *
 * Records a claim row on EVERY outcome, including the ones that look successful.
 * That is what makes the admin queue trustworthy: a member who reaches a good
 * match and then closes the tab leaves an `offered` row, and without it their
 * abandonment would be indistinguishable from never having tried.
 */
export async function searchIdentityAction(
  _prev: ActionResult<IdentitySearchResult> | null,
  formData: FormData,
): Promise<ActionResult<IdentitySearchResult>> {
  const gate = await requireUnconfirmedMember();
  if ("error" in gate) return gate.error;

  const parsed = identityClaimSchema.safeParse({
    eaName: formData.get("eaName"),
    eaUsername: formData.get("eaUsername"),
  });
  if (!parsed.success) {
    return actionError("Confira os campos.", fieldErrorsOf(parsed.error));
  }
  const { eaName, eaUsername } = parsed.data;

  const record = (outcome: "not_found" | "offered" | "ambiguous" | "empty_profile" | "error") =>
    db.identityClaim.create({
      data: {
        memberId: gate.memberId,
        declaredName: eaName,
        declaredUsername: eaUsername,
        outcome,
      },
    });

  let match;
  try {
    match = await gametoolsProvider.matchPlayer(eaName, eaUsername);
  } catch {
    await record("error");
    // Never worded as "not found". A 504 says nothing about the name, and telling
    // a member their correct name is wrong is how they end up inventing a new one.
    return actionError(
      "A fonte de stats não respondeu agora. Isso não quer dizer que o nome está errado — tente de novo em alguns segundos.",
    );
  }

  if (match.status === "not-found") {
    await record("not_found");
    return {
      ok: true,
      data: {
        candidates: [],
        notice:
          `A EA não encontrou nenhuma conta chamada "${eaName}". A busca compara o nome ` +
          "INTEIRO, então tags do clã atrapalham: se o seu nome no jogo é “F4F_Fulano”, " +
          "tente só “Fulano”. Acentos também contam.",
      },
    };
  }

  const candidates = match.status === "resolved" ? [match.identity] : match.candidates;
  const cards: IdentityCard[] = [];
  for (const candidate of candidates) {
    // Sequential: same politeness toward a free community API as everywhere else.
    const card = await gametoolsProvider.fetchIdentityCard(candidate);
    if (card) cards.push(card);
  }

  if (cards.length === 0) {
    await record("error");
    return actionError(
      "Encontramos a conta, mas a fonte não devolveu os dados dela agora. Tente de novo em alguns segundos.",
    );
  }

  const allEmpty = cards.every((card) => card.empty);
  await record(allEmpty ? "empty_profile" : cards.length > 1 ? "ambiguous" : "offered");

  return {
    ok: true,
    data: {
      candidates: cards,
      notice: allEmpty
        ? "Essa conta existe na EA, mas não tem nenhum registro de Battlefield 6. " +
          "Quase sempre significa que é a conta de outra pessoa com nome parecido. " +
          "Confira o nome e tente de novo."
        : cards.length > 1
          ? `${cards.length} contas diferentes atendem por esse nome. Escolha a sua pelos números.`
          : null,
    },
  };
}

/**
 * Binds the account the member picked and stamps the confirmation.
 *
 * RE-READS THE ACCOUNT before writing, rather than trusting the hidden fields.
 * Two things depend on it: an account with no BF6 record must never be bound (it
 * is the §11 signature, and it is exactly what a member mid-mistake is about to
 * click), and `member.eaUsername` has to come from EA rather than from a form.
 *
 * A rebind is safe by construction and needs no extra guard here: every snapshot
 * carries its own `eaNucleusId`, and `deltaForMonth` only subtracts rows sharing
 * one, so the stranger's career the member is walking away from cannot leak into
 * their month.
 */
export async function confirmIdentityAction(
  _prev: ActionResult<{ nickname: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ nickname: string }>> {
  const gate = await requireUnconfirmedMember();
  if ("error" in gate) return gate.error;

  const parsed = confirmIdentitySchema.safeParse({
    eaName: formData.get("eaName"),
    eaUsername: formData.get("eaUsername"),
    personaId: formData.get("personaId"),
    nucleusId: formData.get("nucleusId"),
    resolvedUsername: formData.get("resolvedUsername") ?? undefined,
  });
  if (!parsed.success) {
    return actionError("Confira os campos.", fieldErrorsOf(parsed.error));
  }
  const { eaName, eaUsername, personaId, nucleusId, resolvedUsername } = parsed.data;

  const card = await gametoolsProvider.fetchIdentityCard({
    personaId,
    nucleusId,
    username: resolvedUsername,
  });
  if (!card) {
    return actionError(
      "Não conseguimos ler essa conta agora para confirmar. Tente de novo em alguns segundos.",
    );
  }
  if (card.empty) {
    await db.identityClaim.create({
      data: {
        memberId: gate.memberId,
        declaredName: eaName,
        declaredUsername: eaUsername,
        outcome: "empty_profile",
        eaPersonaId: personaId,
        eaNucleusId: nucleusId,
      },
    });
    return actionError(
      "Essa conta não tem registro de Battlefield 6, então vincular ela deixaria seus stats " +
        "zerados para sempre. Quase sempre é a conta de outra pessoa com nome parecido.",
    );
  }

  const member = await db.$transaction(async (tx) => {
    const updated = await tx.member.update({
      where: { id: gate.memberId },
      data: {
        // The declared name becomes the lookup key: it is the string that PROVED
        // it resolves to this account, which is more than the admin's guess ever was.
        eaName,
        // From EA when EA said it; otherwise left alone, so this column never
        // starts holding typed input (see the schema comment).
        ...(card.identity.username ? { eaUsername: card.identity.username } : {}),
        eaPersonaId: personaId,
        eaNucleusId: nucleusId,
        identityConfirmedAt: new Date(),
        // Clearing both: whatever was wrong before, a member who just identified
        // their own account is collectable again.
        identityHelpRequestedAt: null,
        statsPaused: false,
        statsPausedReason: null,
      },
      select: { nickname: true },
    });

    await tx.identityClaim.create({
      data: {
        memberId: gate.memberId,
        declaredName: eaName,
        declaredUsername: eaUsername,
        outcome: "confirmed",
        eaPersonaId: personaId,
        eaNucleusId: nucleusId,
      },
    });

    return updated;
  });

  revalidateVitrine(CACHE_TAG.members, CACHE_TAG.stats);
  revalidatePath("/confirmar-conta");
  return { ok: true, data: { nickname: member.nickname } };
}

/**
 * "Não consegui": hands the case to an admin and lets the member into the site.
 *
 * BOTH halves matter. Without the hand-off the member vanishes into a cron log;
 * without the release they sit on this screen forever, and for the four members
 * who exist on no source at all that would be permanent.
 *
 * Pauses the collection only when there is nothing bound. A member who already
 * has a working binding and merely doubts it should keep accruing stats while an
 * admin looks — stopping it would cost them ranking points over a question.
 */
export async function requestIdentityHelpAction(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  const gate = await requireUnconfirmedMember();
  if ("error" in gate) return gate.error;

  // Whatever they last typed, even if it fails validation: this is the evidence
  // an admin works from, so an unusable string is more useful than an empty one.
  const declaredName = (formData.get("eaName")?.toString() ?? "").trim().slice(0, 80);
  const declaredUsername = (formData.get("eaUsername")?.toString() ?? "").trim().slice(0, 80);

  const member = await db.member.findUnique({
    where: { id: gate.memberId },
    select: { eaPersonaId: true, eaNucleusId: true },
  });
  const hasBinding = Boolean(member?.eaPersonaId && member?.eaNucleusId);

  await db.$transaction([
    db.identityClaim.create({
      data: {
        memberId: gate.memberId,
        declaredName: declaredName || "(não informado)",
        declaredUsername: declaredUsername || "(não informado)",
        outcome: "not_found",
        needsHelp: true,
      },
    }),
    db.member.update({
      where: { id: gate.memberId },
      data: {
        identityHelpRequestedAt: new Date(),
        ...(hasBinding
          ? {}
          : {
              statsPaused: true,
              statsPausedReason:
                "O membro não conseguiu identificar a própria conta da EA no primeiro login e pediu ajuda",
            }),
      },
    }),
  ]);

  revalidateVitrine(CACHE_TAG.members);
  revalidatePath("/confirmar-conta");
  return { ok: true, data: undefined };
}
