// Presentation data for the sync state, shared by the badge, the filter and the
// column sort. Plain data on purpose: three consumers, and a label that drifts
// between the badge and the filter is a filter nobody trusts.

import type { MemberSyncState } from "./queries";

export type SyncLabel = {
  /** Text on the badge and in the filter. */
  text: string;
  /**
   * What it means and who has to act, shown in a hover card on the badge.
   *
   * Optional because a healthy badge needs no explanation: "Sincronizando" said
   * everything the old tooltip ("a coleta leu os stats deste membro") repeated.
   * A hover card that only restates the label trains admins to ignore hover
   * cards, including the ones that matter.
   */
  title?: string;
  className: string;
  /** Extra classes for the icon, e.g. the spin on a state that means "working". */
  iconClassName?: string;
};

export const SYNC_LABEL: Record<MemberSyncState, SyncLabel> = {
  ok: {
    text: "Sincronizando",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  },
  waiting: {
    text: "Aguardando 1ª leitura",
    // "Aguardando" alone was read as "broken". On 2026-07-28 the panel showed 38
    // members here and the roster looked 50% healthy, when in truth all 38 had
    // recent snapshots and were collecting fine — they simply had not been
    // visited since this column shipped. The label now says which wait it means.
    title:
      "A coleta ainda não passou por este membro DESDE que esta coluna existe. Não indica problema: se ele já tem stats no site, está sincronizando. O estado some assim que a próxima varredura o alcançar.",
    className: "text-muted-foreground",
    // Spins because this state really is in motion: the collector sweeps the
    // roster over two or three runs, so a member sits here until their turn.
    iconClassName: "animate-spin",
  },
  identity_pending: {
    text: "ID não encontrado",
    title:
      "O id da plataforma não corresponde a nenhuma conta EA. Confira o id exato com o membro e corrija no cadastro — a coleta tenta de novo a cada ciclo até lá.",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  },
  no_data: {
    text: "Sem retorno",
    // Now reserved for members who have NEVER had stats — the ones with history
    // are shown as syncing with a warning instead (see queries.ts `syncState`),
    // because a failed batch and an empty profile look identical from here and
    // labelling both as broken buried the five real cases among two dozen
    // phantom ones.
    title:
      "Nenhuma tentativa até agora trouxe estatísticas deste membro. Pode ser um id que casou com outra conta de mesmo nome, um perfil sem partidas de BF6, ou uma sequência de instabilidade da fonte. Confira o id com o membro se continuar assim por várias horas.",
    className: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  },
  paused: {
    text: "Pausado",
    title: "Um admin tirou este membro da coleta. Ele continua visível no site.",
    className: "text-muted-foreground border-dashed",
  },
  off: {
    text: "Fora da coleta",
    title: "Membro inativo ou sem vínculo que o habilite. A coleta não olha para ele.",
    className: "text-muted-foreground",
  },
};

/**
 * The caveat behind the warning icon next to an otherwise healthy badge.
 *
 * Lives here with the other copy so the wording of "we missed this round" is
 * written once, next to the wording of every state it can appear beside.
 */
export const SYNC_RETRY_NOTICE = {
  label: "A última leitura falhou",
  heading: "A última leitura falhou",
  body: "Os stats deste membro estão no site e continuam válidos — só a tentativa mais recente voltou vazia. A fonte (gametools) devolve erro em parte dos lotes, e quando isso acontece o lote inteiro volta sem ninguém. O coletor tenta de novo no próximo ciclo.",
  action: "Nada a fazer. Só investigue se o membro passar horas sem atualizar.",
} as const;

/**
 * States ordered by how much they want an admin's attention, which is also the
 * sort order of the Stats column.
 *
 * The two that need a human come first, then the ones that resolve on their own,
 * then the ones that are fine, then the ones deliberately out of the collection.
 * Sorting a status column alphabetically would bury "ID não encontrado" between
 * "Fora da coleta" and "Pausado", which is the opposite of useful.
 */
export const SYNC_STATES_BY_URGENCY: readonly MemberSyncState[] = [
  "identity_pending",
  "no_data",
  "waiting",
  "ok",
  "paused",
  "off",
];

export function syncUrgency(state: MemberSyncState): number {
  return SYNC_STATES_BY_URGENCY.indexOf(state);
}
