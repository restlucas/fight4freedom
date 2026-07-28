import userEvent from "@testing-library/user-event";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test-utils";

// The row dialogs import the real actions (Prisma) and the table refreshes the
// route after a write; neither belongs in a filtering test.
vi.mock("@/features/admin/lib/actions", () => ({
  createMemberAction: vi.fn(),
  updateMemberAction: vi.fn(),
  createInviteAction: vi.fn(),
  toggleMemberStatsAction: vi.fn(),
}));

vi.mock("@/features/admin/lib/award-actions", () => ({
  awardMedalAction: vi.fn(),
  revokeMedalAction: vi.fn(),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import type { AdminMember } from "@/features/admin/lib/queries";

import { MembersTable } from "./members-table";

function member(
  nickname: string,
  role: AdminMember["role"],
  platform: AdminMember["platform"],
  syncState: AdminMember["sync"]["state"] = "ok",
): AdminMember {
  return {
    id: `${nickname}-id`,
    nickname,
    platform,
    platformId: null,
    statsLinked: true,
    sync: {
      state: syncState,
      checkedAt: null,
      lastAttemptFailed: false,
      canPause: true,
      paused: false,
    },
    role,
    active: true,
    avatarUrl: null,
    discordId: null,
    hasAccount: true,
    isAdmin: false,
    pendingInvite: null,
    awards: [],
  };
}

const MEMBERS: AdminMember[] = [
  member("Panzer", "member", "xbox"),
  member("Águia", "officer", "psn"),
  member("Restless", "admin", "ea"),
  member("Sombra", "member", "ea"),
];

/** Nicknames currently rendered, in row order. */
function rowNames(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1) // drops the header row
    .flatMap((row) => {
      const heading = row.querySelector("p.font-heading");
      return heading?.textContent ? [heading.textContent.trim()] : [];
    });
}

beforeEach(() => {
  window.localStorage.clear();
});

function renderTable(members: AdminMember[] = MEMBERS) {
  return render(<MembersTable members={members} medals={[]} />);
}

describe("MembersTable", () => {
  it("filters by nickname, ignoring accents", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.type(screen.getByLabelText("Buscar membro"), "aguia");

    expect(rowNames()).toEqual(["Águia"]);
  });

  it("filters by cargo", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("button", { name: /Cargo/ }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Oficial" }));

    expect(rowNames()).toEqual(["Águia"]);
  });

  it("filters by platform, accumulating the checked options", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("button", { name: /Plataforma/ }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: /EA/ }));
    expect(rowNames()).toEqual(["Restless", "Sombra"]);

    await user.click(screen.getByRole("menuitemcheckbox", { name: /Xbox/ }));
    expect(rowNames()).toEqual(["Panzer", "Restless", "Sombra"]);
  });

  it("combines search with the filters", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("button", { name: /Plataforma/ }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: /EA/ }));
    await user.keyboard("{Escape}");
    await user.type(screen.getByLabelText("Buscar membro"), "sombra");

    expect(rowNames()).toEqual(["Sombra"]);
  });

  it("says so when the filters match nothing", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.type(screen.getByLabelText("Buscar membro"), "zzz");

    expect(screen.getByText("Nenhum membro encontrado com esses filtros.")).toBeInTheDocument();
  });

  it("paginates and stores the page size under the app's prefix", async () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      member(`Membro ${index + 1}`, "member", "ea"),
    );
    window.localStorage.setItem("@fight4freedom/admin/members-page-size", "10");

    const user = userEvent.setup();
    renderTable(many);

    expect(rowNames()).toHaveLength(10);
    expect(screen.getByText("1–10 de 12 membros")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Próxima página"));
    expect(rowNames()).toHaveLength(2);

    await user.click(screen.getByLabelText("Resultados por página"));
    await user.click(screen.getByRole("option", { name: "25" }));

    expect(window.localStorage.getItem("@fight4freedom/admin/members-page-size")).toBe("25");
    // Changing the size goes back to the first page, now holding everyone.
    expect(rowNames()).toHaveLength(12);
  });

  it("reads a remembered page size on mount", () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      member(`Membro ${index + 1}`, "member", "ea"),
    );
    window.localStorage.setItem("@fight4freedom/admin/members-page-size", "10");

    renderTable(many);
    expect(rowNames()).toHaveLength(10);
  });

  it("ignores a stored page size that is not on offer", () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      member(`Membro ${index + 1}`, "member", "ea"),
    );
    window.localStorage.setItem("@fight4freedom/admin/members-page-size", "7");

    renderTable(many);
    // Falls back to the default of 25 instead of trusting the stored value.
    expect(rowNames()).toHaveLength(25);
  });
});

describe("MembersTable — coluna Stats", () => {
  /** Roster with one member per interesting sync state. */
  const BY_STATE: AdminMember[] = [
    member("Zulu", "member", "ea", "ok"),
    member("Alfa", "member", "ea", "identity_pending"),
    member("Bravo", "member", "ea", "no_data"),
    member("Charlie", "member", "ea", "waiting"),
  ];

  it("filters by sync state", async () => {
    const user = userEvent.setup();
    render(<MembersTable members={BY_STATE} medals={[]} />);

    // The filter trigger is exactly "Stats"; the sort button carries the action
    // in its accessible name, so the two are distinguishable.
    await user.click(screen.getByRole("button", { name: "Stats" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "ID não encontrado" }));

    expect(rowNames()).toEqual(["Alfa"]);
  });

  it("sorts by urgency, not alphabetically", async () => {
    // Alphabetical would bury "ID não encontrado" between "Fora da coleta" and
    // "Pausado" — the opposite of what this column is opened for.
    const user = userEvent.setup();
    render(<MembersTable members={BY_STATE} medals={[]} />);

    await user.click(screen.getByRole("button", { name: /^Stats: /i }));

    expect(rowNames()).toEqual(["Alfa", "Bravo", "Charlie", "Zulu"]);
  });

  it("reverses to healthy-first on the second click, then clears", async () => {
    const user = userEvent.setup();
    render(<MembersTable members={BY_STATE} medals={[]} />);

    const header = () => screen.getByRole("button", { name: /^Stats: /i });
    await user.click(header());
    await user.click(header());
    expect(rowNames()).toEqual(["Zulu", "Charlie", "Bravo", "Alfa"]);

    await user.click(header());
    // Back to the server order.
    expect(rowNames()).toEqual(["Zulu", "Alfa", "Bravo", "Charlie"]);
  });

  it("refreshes the route on demand, because the column does not poll", async () => {
    const user = userEvent.setup();
    render(<MembersTable members={BY_STATE} medals={[]} />);

    await user.click(screen.getByRole("button", { name: /atualizar/i }));

    expect(refresh).toHaveBeenCalled();
  });
});

describe("MembersTable — relógio da coleta", () => {
  function checked(nickname: string, at: string | null): AdminMember {
    const base = member(nickname, "member", "ea");
    return { ...base, sync: { ...base.sync, checkedAt: at } };
  }

  it("reports the newest attempt across the whole roster", () => {
    // Newest, not oldest: the question is "is the collector alive", and one
    // member stuck at the back of the queue does not mean it stopped.
    vi.useFakeTimers();
    try {
      const now = new Date("2026-07-28T12:00:00Z");
      vi.setSystemTime(now);
      render(
        <MembersTable
          members={[
            checked("Antigo", "2026-07-28T09:00:00.000Z"),
            checked("Recente", "2026-07-28T11:56:00.000Z"),
            checked("Nunca", null),
          ]}
          medals={[]}
        />,
      );

      expect(screen.getByText(/Última coleta de dados há 4 min/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps counting while the panel stays open", async () => {
    // Computed once at render, the label froze at "há 1 min" while the real gap
    // grew. A frozen relative time is worse than none: it reads as fresh.
    vi.useFakeTimers();
    try {
      const start = new Date("2026-07-28T12:00:00Z");
      vi.setSystemTime(start);
      render(
        <MembersTable members={[checked("Panzer", "2026-07-28T11:59:00.000Z")]} medals={[]} />,
      );
      expect(screen.getByText(/há 1 min/)).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(10 * 60_000);
      });

      expect(screen.getByText(/há 11 min/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("says so plainly when nothing was ever collected", () => {
    render(<MembersTable members={[checked("Panzer", null)]} medals={[]} />);
    expect(screen.getByText("A coleta ainda não rodou")).toBeInTheDocument();
  });
});
