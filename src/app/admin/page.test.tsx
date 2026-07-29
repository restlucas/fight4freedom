import { describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test-utils";

vi.mock("@/features/admin/lib/queries", () => ({
  getAdminOverview: vi.fn().mockResolvedValue({
    members: 99,
    inactiveMembers: 1,
    linkedAccounts: 2,
    admins: 1,
    pendingInvites: 3,
    medals: 4,
    awards: 6,
  }),
}));

vi.mock("@/features/clan/lib/queries", () => ({
  ACTIVITY_FEED_LIMIT: 8,
  getActivityFeed: vi.fn().mockResolvedValue([
    {
      id: "ev1",
      kind: "session",
      memberId: "m1",
      nickname: "douglasccosta",
      avatarUrl: null,
      occurredAt: "2026-07-29T01:00:00.000Z",
      updatedAt: "2026-07-29T01:20:00.000Z",
      points: 1_240,
      minutesPlayed: 155,
      rankSlug: null,
    },
  ]),
}));

import AdminHomePage from "./page";

describe("AdminHomePage", () => {
  it("folds the overview into four tiles without dropping a number", async () => {
    // Seven cards became four on 2026-07-29, and the numbers that lost their card
    // moved into hints. This is the regression that catches one being dropped.
    render(await AdminHomePage());

    expect(screen.getByRole("heading", { name: "Visão geral" })).toBeInTheDocument();
    for (const label of ["Membros", "Contas vinculadas", "Convites pendentes", "Medalhas"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // Singular, because the old hint read "1 inativos".
    expect(screen.getByText(/1 inativo · 97 sem conta/)).toBeInTheDocument();
    expect(screen.getByText(/logam com Discord · 1 admin/)).toBeInTheDocument();
    expect(screen.getByText(/no catálogo · 6 concedidas/)).toBeInTheDocument();
  });

  it("keeps the actions in the header, beside the title", async () => {
    render(await AdminHomePage());

    const header = screen.getByRole("banner", { hidden: true });
    expect(header).toHaveTextContent("Visão geral");
    expect(header).toHaveTextContent("Gerenciar membros");
    expect(header).toHaveTextContent("Ver a vitrine");
  });

  it("shows the activity feed, which is also the closest thing to a collection monitor", async () => {
    // Rows appearing here mean the worker ran and credited. Panel only since
    // 2026-07-29: the feed is operational information, not vitrine content.
    render(await AdminHomePage());

    expect(screen.getByRole("heading", { name: "Atividade recente" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /douglasccosta/ })).toHaveTextContent("2h35");
  });
});
