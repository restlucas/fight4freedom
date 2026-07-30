import { beforeEach, describe, expect, it, vi } from "vitest";

import { rankForPoints, rankProgress } from "@/lib/ranks";
import { render, screen } from "@/test-utils";

// Stubbed: it calls useRouter, which needs a router context these tests do not
// provide, and its behaviour has its own suite (refresh-on-focus.test.tsx).
vi.mock("@/components/refresh-on-focus", () => ({ RefreshOnFocus: () => null }));

// Who is looking at the page, which decides whether the progression section
// renders at all and whether the bio is editable. Hoisted so the factory below can
// close over the same spy.
const { getSessionProfile } = vi.hoisted(() => ({ getSessionProfile: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSessionProfile }));

// MemberBio is rendered inline on this page and imports its Server Action, which
// pulls in Prisma. The component has its own suite (member-bio.test.tsx); here the
// action only needs to exist.
vi.mock("@/features/profile/lib/actions", () => ({ updateBioAction: vi.fn() }));

/** The profile whose page this is — the member reading their own progression. */
const OWNER = { id: "u-owner", isAdmin: false, memberId: "m1", member: null };
/** Signed in, part of the clan, but this is somebody else's page. */
const OTHER_MEMBER = { id: "u-other", isAdmin: false, memberId: "m2", member: null };
/** Admin: sees every member's progression, on `isAdmin` and never on member.role. */
const ADMIN = { id: "u-admin", isAdmin: true, memberId: "m9", member: null };

vi.mock("@/features/clan/lib/queries", () => ({
  // This member leads the clan in kills, so the Kills tile gets a crown.
  getStatLeaders: vi.fn().mockResolvedValue({
    kd: [],
    kills: ["m1"],
    matches: [],
    hours: [],
  }),
  getMemberProfile: vi.fn().mockResolvedValue({
    id: "m1",
    nickname: "RRRRRRRREST",
    platform: "ea",
    platformId: "RRRRRRRREST",
    role: "admin",
    avatarUrl: null,
    // A literal, because vi.mock is hoisted above the imports and cannot read the
    // ladder. The ASSERTION derives the expected rank from these points instead,
    // so a recalibration (2026-07-28, and again when the weights are retuned)
    // changes which rank is expected without touching the fixture.
    rankPoints: 13_000,
    // The data layer serializes dates as ISO strings (the cache is JSON).
    joinedAt: "2025-10-01T00:00:00.000Z",
    bio: "Jogo de support, quase sempre de noite.",
    // The GAME's standing, collected on the rotating profile pass (Fase 9.2).
    gameRankName: "Second Lieutenant V",
    gameRankLevel: 141,
    gameRankImageUrl: "https://cdn.gametools.network/ranks/bf6/t_ui_rank_140_sm.png",
    badgeCount: 104,
    dogTagCount: 39,
    // Unranked in the source, which the collector stores as null.
    competitiveRankName: null,
    competitiveRankMode: null,
    xpTotal: 10_308_364,
    // Fase 10: one of each kind. The mode carries no artwork because its art is SVG
    // and the collector drops the URL.
    topItems: [
      {
        kind: "weapon",
        name: "L110",
        group: "Machine Guns",
        imageUrl: "https://cdn.gametools.network/weapons/bf6/L110.webp",
        kills: 3_412,
        matches: 0,
        wins: 0,
        secondsUsed: 21_500,
        accuracy: 21.91,
      },
      {
        kind: "gamemode",
        name: "Escalation",
        group: null,
        imageUrl: null,
        kills: 969,
        matches: 37,
        wins: 16,
        secondsUsed: 52_212,
        accuracy: null,
      },
      {
        kind: "map",
        name: "Siege of Cairo",
        group: null,
        imageUrl: "https://cdn.gametools.network/maps/bf6/Abbasid.webp",
        kills: 0,
        matches: 86,
        wins: 50,
        secondsUsed: 113_310,
        accuracy: null,
      },
    ],
    bestClass: "assault",
    medalCount: 1,
    totals: {
      kills: 200,
      deaths: 100,
      wins: 12,
      losses: 8,
      assists: 50,
      revives: 30,
      headshots: 40,
      objectivesCaptured: 15,
      timePlayedMinutes: 120,
    },
    // 40 headshots over 400 all-mode kills = 10 %.
    headshotRate: 0.1,
    medals: [
      {
        id: "md1",
        name: "Sharpshooter",
        tier: "legendary",
        icon: "crosshair",
        imageUrl: null,
        criteria: "20 kills without dying",
        description: null,
        awardedAt: "2026-07-01T00:00:00.000Z",
      },
    ],
    // Empty on purpose: most of the roster is here today (collection started on
    // 27/07), so the empty state is the common case and gets its own test.
    progression: [],
  }),
}));

import MemberProfilePage from "./page";

describe("MemberProfilePage", () => {
  beforeEach(() => {
    // Default viewer is the member themselves: the progression section is part of
    // the page for them, so the tests about the rest of the page keep their layout.
    getSessionProfile.mockResolvedValue(OWNER);
  });

  it("renders the member name, stats and medals", async () => {
    render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));
    expect(screen.getByRole("heading", { name: "RRRRRRRREST", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Estatísticas")).toBeInTheDocument();
    expect(screen.getByText("Sharpshooter")).toBeInTheDocument();
    // Best class shows in the header badge and in the stats grid.
    expect(screen.getAllByText("Assalto").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/1 de outubro de 2025/)).toBeInTheDocument();
  });

  it("shows the headshot tile as a percentage, not an absolute count", async () => {
    // Absolutes here are not comparable with the Kills tile beside them: headshots
    // include bots, kills do not, which is how a member showed more headshots than
    // kills. The label carries the unit so the number is never ambiguous.
    render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));
    expect(screen.getByText("Headshots %")).toBeInTheDocument();
    expect(screen.getByText("10,0%")).toBeInTheDocument();
    expect(screen.queryByText("Headshots", { exact: true })).not.toBeInTheDocument();
  });

  it("explains the missing progression chart instead of showing an empty frame", async () => {
    // A blank plot reads as a bug — the same mistake the panel's "Aguardando 1ª
    // leitura" label fixed. Two readings are the minimum for a line to exist.
    render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));
    expect(screen.getByText("Progressão")).toBeInTheDocument();
    expect(screen.getByText("Sem histórico suficiente ainda")).toBeInTheDocument();
    expect(screen.getByText(/a partir da segunda leitura/)).toBeInTheDocument();
  });

  it("keeps the CLAN rank in the header card, with its progress bar", async () => {
    // The clan ladder is what the clan competes on, so it holds the header slot
    // (clan owner, 2026-07-29). The game's own progression sits above the tiles.
    render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));

    expect(screen.getByText(rankForPoints(13_000).name)).toBeInTheDocument();
    // The bar is named after the NEXT rank, derived so a recalibration does not
    // need this file edited.
    expect(
      screen.getByRole("progressbar", {
        name: `Progresso para ${rankProgress(13_000).next?.name}`,
      }),
    ).toBeInTheDocument();
    // The numbers only show on hover, inside the hover card.
    expect(screen.queryByText(/13\.000/)).not.toBeInTheDocument();
  });

  it("shows the game's level in the panel above the tiles", async () => {
    render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));

    expect(screen.getByText("Nível 141")).toBeInTheDocument();
    expect(screen.getByText("Second Lieutenant V")).toBeInTheDocument();
  });

  it("shows the best weapon, mode and map in the panel", async () => {
    render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));

    expect(screen.getByText("Melhor arma")).toBeInTheDocument();
    expect(screen.getByText("L110")).toBeInTheDocument();
    expect(screen.getByText("Modo mais jogado")).toBeInTheDocument();
    expect(screen.getByText("Escalation")).toBeInTheDocument();
    expect(screen.getByText("Mapa mais jogado")).toBeInTheDocument();
    expect(screen.getByText("Siege of Cairo")).toBeInTheDocument();
  });

  it("drops the game panel entirely while nothing has been collected", async () => {
    // The normal state for a few hours after a member is added: the profile pass
    // reads 10 per cycle. An empty panel would announce a hole that fills itself.
    const { getMemberProfile } = await import("@/features/clan/lib/queries");
    const base = await (getMemberProfile as unknown as () => Promise<Record<string, unknown>>)();
    vi.mocked(
      getMemberProfile as unknown as (id: string) => Promise<unknown>,
    ).mockResolvedValueOnce({ ...base, gameRankName: null, gameRankLevel: null, topItems: [] });

    render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));

    expect(screen.queryByText("Nível 141")).not.toBeInTheDocument();
    // The rest of the section is untouched.
    expect(screen.getByText("Estatísticas")).toBeInTheDocument();
    expect(screen.getByText("Insígnias")).toBeInTheDocument();
  });

  it("shows the collectable counts and XP in the stats grid", async () => {
    render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));

    expect(screen.getByText("Insígnias")).toBeInTheDocument();
    expect(screen.getByText("104")).toBeInTheDocument();
    expect(screen.getByText("Dog tags")).toBeInTheDocument();
    expect(screen.getByText("39")).toBeInTheDocument();
    expect(screen.getByText("XP total")).toBeInTheDocument();
    expect(screen.getByText("10,3 mi")).toBeInTheDocument();
    // Unranked in the source, stored as null, so no tile. See PlayerStats.
    expect(screen.queryByText(/^Ranked/)).not.toBeInTheDocument();
  });

  it("falls back to the default artwork when there is no best class", async () => {
    const { getMemberProfile } = await import("@/features/clan/lib/queries");
    const base = await (getMemberProfile as unknown as () => Promise<Record<string, unknown>>)();
    vi.mocked(
      getMemberProfile as unknown as (id: string) => Promise<unknown>,
    ).mockResolvedValueOnce({ ...base, bestClass: null });

    render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));

    const header = screen.getByRole("banner");
    const background = header.querySelector("img");
    expect(background?.getAttribute("src")).toContain("background.avif");
  });

  it("shows the platform icon with the platform id", async () => {
    render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));
    expect(screen.getByLabelText(/Plataforma: EA · RRRRRRRREST/)).toBeInTheDocument();
  });

  it("crowns the stats the member leads in the clan", async () => {
    render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));
    expect(screen.getByLabelText("Líder do clã em Kills")).toBeInTheDocument();
    expect(screen.queryByLabelText("Líder do clã em Partidas")).not.toBeInTheDocument();
  });

  // Progression is private: the member's own record of when they played and how
  // fast they climb. The rest of the profile stays vitrine.
  describe("progression visibility", () => {
    it("hides the whole section from a signed-out visitor", async () => {
      getSessionProfile.mockResolvedValue(null);

      render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));

      expect(screen.queryByText("Progressão")).not.toBeInTheDocument();
      expect(screen.queryByText(/Próxima patente/)).not.toBeInTheDocument();
      expect(screen.queryByText("Sem histórico suficiente ainda")).not.toBeInTheDocument();
      // Only the section went away, not the page.
      expect(screen.getByRole("heading", { name: "RRRRRRRREST", level: 1 })).toBeInTheDocument();
      expect(screen.getByText("Estatísticas")).toBeInTheDocument();
      expect(screen.getByText("Sharpshooter")).toBeInTheDocument();
    });

    it("hides it from another signed-in member", async () => {
      // The regression that matters most: being logged in is not the permission,
      // being THIS member is.
      getSessionProfile.mockResolvedValue(OTHER_MEMBER);

      render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));

      expect(screen.queryByText("Progressão")).not.toBeInTheDocument();
    });

    it("shows it to the member themselves", async () => {
      getSessionProfile.mockResolvedValue(OWNER);

      render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));

      expect(screen.getByText("Progressão")).toBeInTheDocument();
      expect(screen.getByText(/Próxima patente/)).toBeInTheDocument();
    });

    it("shows it to an admin on someone else's page", async () => {
      getSessionProfile.mockResolvedValue(ADMIN);

      render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));

      expect(screen.getByText("Progressão")).toBeInTheDocument();
      expect(screen.getByText(/Próxima patente/)).toBeInTheDocument();
    });
  });

  // Editing the bio is a WRITE, so the rule is narrower than the progression's: the
  // member and nobody else, admins included. An admin putting sentences in a
  // member's mouth from the public page is not a data fix, and data fixes are what
  // the panel is for.
  describe("bio editing", () => {
    it("reads as plain text for a signed-out visitor", async () => {
      getSessionProfile.mockResolvedValue(null);

      render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));

      expect(screen.getByText("Jogo de support, quase sempre de noite.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /bio/i })).not.toBeInTheDocument();
    });

    it("is not editable by another signed-in member", async () => {
      getSessionProfile.mockResolvedValue(OTHER_MEMBER);

      render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));

      expect(screen.getByText("Jogo de support, quase sempre de noite.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /bio/i })).not.toBeInTheDocument();
    });

    it("is not editable by an admin on someone else's page", async () => {
      getSessionProfile.mockResolvedValue(ADMIN);

      render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));

      expect(screen.getByText("Jogo de support, quase sempre de noite.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /bio/i })).not.toBeInTheDocument();
    });

    it("is editable by the member themselves", async () => {
      getSessionProfile.mockResolvedValue(OWNER);

      render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));

      expect(screen.getByRole("button", { name: "Editar sua bio" })).toBeInTheDocument();
    });

    it("invites the member to add one when the bio is empty", async () => {
      const { getMemberProfile } = await import("@/features/clan/lib/queries");
      const base = await (getMemberProfile as unknown as () => Promise<Record<string, unknown>>)();
      vi.mocked(
        getMemberProfile as unknown as (id: string) => Promise<unknown>,
      ).mockResolvedValueOnce({ ...base, bio: null });
      getSessionProfile.mockResolvedValue(OWNER);

      render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));

      expect(screen.getByRole("button", { name: "Adicionar uma bio" })).toBeInTheDocument();
    });

    it("renders nothing where the bio would be when it is empty and not ours", async () => {
      const { getMemberProfile } = await import("@/features/clan/lib/queries");
      const base = await (getMemberProfile as unknown as () => Promise<Record<string, unknown>>)();
      vi.mocked(
        getMemberProfile as unknown as (id: string) => Promise<unknown>,
      ).mockResolvedValueOnce({ ...base, bio: null });
      getSessionProfile.mockResolvedValue(OTHER_MEMBER);

      render(await MemberProfilePage({ params: Promise.resolve({ id: "m1" }) }));

      expect(screen.queryByText("Adicione uma bio")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /bio/i })).not.toBeInTheDocument();
    });
  });
});
