// Display helpers for the clan vitrine (pt-BR labels and number formatting).

import type { MedalTier, MemberRole, Platform, PlayerClass } from "@prisma/client";

export const PLATFORM_LABEL: Record<Platform, string> = {
  ea: "EA",
  xbox: "Xbox",
  psn: "PSN",
};

export const ROLE_LABEL: Record<MemberRole, string> = {
  member: "Membro",
  officer: "Oficial",
  admin: "Admin",
};

// Feminine forms to agree with "medalha".
export const TIER_LABEL: Record<MedalTier, string> = {
  common: "Comum",
  rare: "Rara",
  legendary: "Lendária",
  special: "Especial",
};

export const CLASS_LABEL: Record<PlayerClass, string> = {
  assault: "Assalto",
  engineer: "Engenheiro",
  support: "Suporte",
  recon: "Recon",
};

const numberFormatter = new Intl.NumberFormat("pt-BR");

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatKd(kd: number): string {
  return kd.toFixed(2);
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function formatHours(timePlayedMinutes: number): string {
  return `${numberFormatter.format(Math.round(timePlayedMinutes / 60))} h`;
}

export function formatKillsPerMatch(value: number): string {
  return value.toFixed(1);
}

/**
 * Headshot rate, e.g. "11,8%". One decimal, unlike `formatPercent`: the values
 * cluster between 10 and 20 %, and rounding to whole numbers would make most of
 * the roster look identical.
 */
export function formatHeadshotRate(fraction: number): string {
  return `${(fraction * 100).toFixed(1).replace(".", ",")}%`;
}

/** Ranking score, e.g. "1.240". */
export function formatPoints(points: number): string {
  return numberFormatter.format(points);
}

/** Month label for the ranking season, e.g. "julho de 2026". */
export function formatMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

/** Avatar fallback: up to two alphanumeric characters from the gamertag. */
export function memberInitials(nickname: string): string {
  return (
    nickname
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

/**
 * Lowercases and strips diacritics so searching "criterio" also matches
 * "critério" (medal names and descriptions are written in pt-BR).
 */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}
