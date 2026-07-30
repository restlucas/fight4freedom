// Shared site constants: navigation, the "join" form and social links.

/**
 * Where "quero entrar" goes. OUR page since Fase 11.3, not the Google Form.
 *
 * The form it replaces asked seven questions and none of them resolved the EA account,
 * which is the origin of the project's most expensive defect: 23 of 99 members bound to
 * no EA account, because the name was typed by an admin guessing. Ours asks the person
 * who knows, and the answer lands in a queue an admin approves.
 *
 * The Google Form is kept below, unused by the app, because years of answers live in its
 * spreadsheet and the new questions were worded to stay comparable with them.
 */
export const JOIN_PATH = "/candidatar";

/** The form Fase 11.3 replaced. Not linked anywhere; kept for the spreadsheet's sake. */
export const LEGACY_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSeBPFiRfVsV_eNloaHeJ4O8UT0CPvW7woRB6CnLDIF_SASwQw/viewform";

/**
 * Header navigation, in the order it is rendered.
 *
 * Ranking sits right after Home (clan owner, 2026-07-29): it is the page the clan
 * actually competes on, so it comes before the roster and the medals rather than after
 * them.
 */
export const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/ranking", label: "Ranking" },
  { href: "/membros", label: "Membros" },
  { href: "/medalhas", label: "Medalhas" },
  { href: "/melhores-jogadas", label: "Melhores jogadas" },
] as const;

export const SOCIAL_LINKS = {
  whatsapp: "https://chat.whatsapp.com/CbKz17jSaUp8S98ZrN3yNa?mode=ems_wa_t",
  discord: "https://discord.gg/yourserver",
  instagram: "https://www.instagram.com/fight4freedombr/",
  youtube: "https://www.youtube.com/@Fight4FreedomBR",
} as const;

export const DEVELOPER_URL = "https://www.linkedin.com/in/restlucas/";
