// Presentation data for the sync state, shared by the badge, the filter and the
// column sort. Plain data on purpose: three consumers, and a label that drifts
// between the badge and the filter is a filter nobody trusts.

import type { MemberSyncState } from "./queries";

export type SyncLabel = {
  /** Text on the badge and in the filter. */
  text: string;
  /** What it means and who has to act. Shown on hover. */
  title: string;
  className: string;
  /** Extra classes for the icon, e.g. the spin on a state that means "working". */
  iconClassName?: string;
};

export const SYNC_LABEL: Record<MemberSyncState, SyncLabel> = {
  ok: {
    text: "Sincronizando",
    title: "A coleta leu os stats deste membro na última tentativa.",
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
    // Deliberately does NOT say "wrong id". Measured on 2026-07-27: 15 members
    // carried this state while only 5 genuinely lack BF6 data — the other 10 were
    // transient 504s from the source. The collector cannot yet tell the two apart
    // (a failed batch and an empty profile both come back as "no player"), so
    // claiming a cause here would send an admin chasing ten phantom id problems.
    title:
      "A última tentativa não trouxe estatísticas. Pode ser instabilidade da fonte, que se resolve sozinha no próximo ciclo, ou o id ter casado com outra conta de mesmo nome. Só investigue se persistir por várias horas.",
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
