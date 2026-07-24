// Display helpers for the clan vitrine (pt-BR labels and number formatting).

import type {
  MedalTier,
  MemberRole,
  Platform,
  PlayerClass,
} from "@prisma/client";

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

export const TIER_LABEL: Record<MedalTier, string> = {
  bronze: "Bronze",
  silver: "Prata",
  gold: "Ouro",
  legendary: "Lendária",
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
