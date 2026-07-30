// Validation for the public candidature form. On the server, because this is the one
// form in the project ANYONE can post to.
//
// The questions mirror the Google Form the clan already recruits with, verbatim where
// they exist there, so the answers collected here stay comparable with the ones already
// in that spreadsheet. The two additions are called out on their fields.

import { z } from "zod";

/** Platform, as the form words it, mapped to our enum on parse. */
export const RECRUIT_PLATFORMS = [
  { value: "psn", label: "PlayStation 5" },
  { value: "xbox", label: "Xbox" },
  // The form says "PC" and our enum says `ea`, because EA is where the account lives.
  // Nobody applying knows what "ea" means, so the label stays PC.
  { value: "ea", label: "PC" },
] as const;

/** Age brackets, copied verbatim from the Google Form — overlap included, see schema. */
export const AGE_BRACKETS = [
  { value: "age_12_17", label: "12 a 17 anos" },
  { value: "age_17_25", label: "17 a 25 anos" },
  { value: "age_25_30", label: "25 a 30 anos" },
  { value: "age_30_40", label: "30 a 40 anos" },
  { value: "age_40_plus", label: "40+ anos" },
] as const;

/** Referral options, verbatim, with the form's free-text escape hatch. */
export const REFERRAL_OPTIONS = [
  "Redes Sociais",
  "Amigos",
  "Pesquisa Google",
  "Youtube",
  "Outro",
] as const;

/** How long the form must have been on screen before a submit is believable. */
export const MIN_FILL_SECONDS = 4;

const shortText = (label: string, max = 80) =>
  z
    .string({ message: `Informe ${label}` })
    .trim()
    .min(2, `Informe ${label}`)
    .max(max, `Use no máximo ${max} caracteres`);

export const recruitFormSchema = z.object({
  realName: shortText("seu nome"),
  /**
   * WhatsApp with area code. Digits are counted rather than pattern-matched: people
   * type `(11) 99999-9999`, `11999999999` and `+55 11 9...`, and rejecting any of
   * those loses a candidate over punctuation. An admin reads this and calls it.
   */
  whatsapp: z
    .string({ message: "Informe seu WhatsApp" })
    .trim()
    .min(8, "Informe o WhatsApp com DDD")
    .max(24, "Use no máximo 24 caracteres")
    .refine((value) => (value.match(/\d/g)?.length ?? 0) >= 10, {
      message: "Informe o número com DDD, só os dígitos já bastam",
    }),
  nickname: shortText("seu nick no jogo", 32),
  /**
   * NOT IN THE GOOGLE FORM, and the reason this page is worth building.
   *
   * EA's search matches the WHOLE display name, so a clan tag typed in here finds
   * nothing — which is exactly how 23 of 99 members ended up bound to no account.
   * Asked of the person who knows the answer, with the tag warning in the field's help
   * text rather than in a validation rule, because we cannot tell a tag from a name.
   */
  declaredEaName: shortText("seu nome de exibição da EA"),
  declaredEaUsername: z
    .string()
    .trim()
    .max(80, "Use no máximo 80 caracteres")
    .optional()
    .transform((value) => (value ? value : null)),
  discordHandle: z
    .string()
    .trim()
    .max(64, "Use no máximo 64 caracteres")
    .optional()
    .transform((value) => (value ? value : null)),
  platform: z.enum(RECRUIT_PLATFORMS.map((p) => p.value) as unknown as [string, ...string[]], {
    message: "Escolha sua plataforma",
  }),
  ageBracket: z.enum(AGE_BRACKETS.map((a) => a.value) as unknown as [string, ...string[]], {
    message: "Escolha sua faixa de idade",
  }),
  hasGame: z.enum(["sim", "nao"], { message: "Responda se você tem o jogo" }),
  referral: z
    .string()
    .trim()
    .max(80, "Use no máximo 80 caracteres")
    .optional()
    .transform((value) => (value ? value : null)),
  /**
   * HONEYPOT. A field a human never sees and never fills, so anything in it is a bot.
   * Named like something worth filling on purpose: `website` is what the crawlers that
   * bother with small forms look for.
   */
  website: z
    .string()
    .optional()
    .refine((value) => !value, { message: "Envio inválido." }),
  /**
   * Seconds the form was on screen, from a hidden field stamped at render.
   *
   * Trivially forgeable, which is fine: it is not a security boundary, it is a filter
   * for the automated submitter that posts the moment it finds the form. Cheap to add,
   * and it costs a real person nothing because reading the questions takes longer.
   */
  elapsedSeconds: z.coerce
    .number()
    .refine((value) => Number.isFinite(value) && value >= MIN_FILL_SECONDS, {
      message: "Envio muito rápido. Confira os campos e envie de novo.",
    }),
});

export type RecruitFormValues = z.output<typeof recruitFormSchema>;
