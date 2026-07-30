// Presentation data for the activity state, kept beside the sync labels and for the
// same reason: more than one consumer (the badge today, a filter tomorrow), and a
// label that drifts between them is a filter nobody trusts.

import type { MemberActivityState } from "./queries";

/**
 * Days without playing before the panel starts pointing at a member.
 *
 * 7 and 14 (clan owner, 2026-07-29). Constants rather than literals because the
 * derivation in ./queries.ts and the labels below have to agree: a badge saying
 * "14+ dias" at a threshold the query does not use is a badge nobody trusts.
 *
 * THEY LIVE HERE AND NOT WITH THE QUERY, deliberately. `queries.ts` imports the db, so
 * a client component reading a VALUE from it pulls Prisma into the browser bundle —
 * which is exactly what happened the first time these were declared there, and it
 * failed as `Missing required environment variable: DATABASE_URL` in a component test
 * rather than as anything that looked like a bundling problem. This module imports
 * nothing but a type, so it is safe from both sides.
 */
export const ACTIVITY_AT_RISK_DAYS = 7;
export const ACTIVITY_ABSENT_DAYS = 14;

/**
 * Activity states from "needs attention" to "needs nothing", for the column sort.
 *
 * Not alphabetical, for the same reason the sync column is not: alphabetical would put
 * `absent` next to `at_risk` by accident and bury both under `never_seen`, which is the
 * opposite of what an admin opens the column to find.
 *
 * `playing` is last because there is nothing to do about it. `unknown` sits just before
 * it — there IS something to do, but it is a record to fix rather than a person to call,
 * and the Stats column is where that work is already listed.
 */
export const ACTIVITY_STATES_BY_URGENCY: readonly MemberActivityState[] = [
  "absent",
  "at_risk",
  "never_seen",
  "unknown",
  "playing",
];

/** Position in the list above. Lower means "look at this first". */
export function activityUrgency(state: MemberActivityState): number {
  return ACTIVITY_STATES_BY_URGENCY.indexOf(state);
}

export type ActivityLabel = {
  /** Text on the badge. */
  text: string;
  /**
   * What it means and WHO has to act, in a hover card.
   *
   * Present on every state except the healthy one, because each of the other four
   * asks for something different and the difference is the entire value of the
   * column: two of them are about the record and two are about the person.
   */
  title?: string;
  className: string;
};

export const ACTIVITY_LABEL: Record<MemberActivityState, ActivityLabel> = {
  playing: {
    text: "Jogando",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  },
  at_risk: {
    text: `${ACTIVITY_AT_RISK_DAYS}+ dias sem jogar`,
    title:
      "Uma semana quieto. Não é ausência ainda, é o momento em que uma mensagem custa barato e ainda faz diferença.",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  },
  absent: {
    text: `${ACTIVITY_ABSENT_DAYS}+ dias sem jogar`,
    title:
      "Duas semanas sem nenhuma partida registrada. A coleta está funcionando para este membro: o silêncio é dele, não nosso.",
    className: "border-red-500/40 bg-red-500/10 text-red-300",
  },
  never_seen: {
    text: "Nunca vimos jogar",
    title:
      "A coleta lê este membro sem erro e nunca registrou uma partida dele. Pode ser que não jogue, ou que tenha parado antes de a coleta existir (27/07). Resolve sozinho na primeira vez que ele jogar.",
    className: "text-muted-foreground",
  },
  unknown: {
    text: "Não sabemos",
    title:
      "Não é ausência, é falta de dado: este membro está inativo, pausado, sem identidade da EA vinculada ou nunca foi lido com sucesso. Conserte o cadastro (coluna Stats) antes de cobrar presença — a pessoa pode estar jogando todo dia sem que a gente veja.",
    className: "text-muted-foreground",
  },
};
