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
  never_read: {
    text: "Conta errada?",
    // The state that exists because its absence cost days. Four members had been
    // failing every single cycle since registration, wearing the same badge as
    // members whose batch merely 504'd that round — so nobody looked. Digging into
    // them on 2026-07-28 found the cause and it was the same for all four: the
    // `eaName` matched an EA account that exists but is not theirs, with no BF6
    // data at all. One was fixed by the name alone (`Bravo_six762` → `F4F WISLAN`,
    // an account with 836 matches and 315 h played).
    //
    // Phrased as a question because it is a strong suspicion, not a certainty: a
    // member who genuinely owns BF6 but has never played a match looks the same.
    title:
      "A coleta NUNCA conseguiu ler este membro, nem uma vez. Isso não é instabilidade da fonte — essa se corrige sozinha no ciclo seguinte. Quase sempre significa que o nome EA cadastrado casou com outra conta de nome parecido, que existe mas não é dele. Peça o EA ID exato ao membro (o nome que aparece no app da EA, não o nick do clã nem a gamertag do console) e corrija no cadastro.",
    className: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  },
  no_data: {
    text: "Sem retorno",
    // Reserved for a member who HAS been read before and now cannot be. Rarer than
    // it looks: a failed round on someone with snapshots reads as syncing with a
    // warning, and one who was never read at all is `never_read`. What is left is
    // the odd middle — read successfully once, no snapshot yet, failing now.
    title:
      "Este membro já foi lido com sucesso antes, mas as tentativas recentes voltam vazias. Pode ser instabilidade da fonte, que se resolve sozinha, ou uma conta que trocou de nome. Investigue se continuar assim por várias horas.",
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
  // First, because it is the only state that never resolves on its own and the
  // only one whose fix is known: correct the eaName.
  "never_read",
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
