// Shared site constants: navigation, the "join" form and social links.

export const FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSeBPFiRfVsV_eNloaHeJ4O8UT0CPvW7woRB6CnLDIF_SASwQw/viewform";

export const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/membros", label: "Membros" },
  { href: "/medalhas", label: "Medalhas" },
  { href: "/ranking", label: "Ranking" },
  { href: "/melhores-jogadas", label: "Melhores jogadas" },
] as const;

export const SOCIAL_LINKS = {
  whatsapp: "https://chat.whatsapp.com/CbKz17jSaUp8S98ZrN3yNa?mode=ems_wa_t",
  discord: "https://discord.gg/yourserver",
  instagram: "https://www.instagram.com/fight4freedombr/",
  youtube: "https://www.youtube.com/@Fight4FreedomBR",
} as const;

export const DEVELOPER_URL = "https://www.linkedin.com/in/restlucas/";
