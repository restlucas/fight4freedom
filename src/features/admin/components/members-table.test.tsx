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
    eaName: null,
    eaUsername: null,
    statsLinked: true,
    sync: {
      state: syncState,
      checkedAt: null,
      readAt: null,
      lastAttemptFailed: false,
      canPause: true,
      paused: false,
      helpRequestedAt: null,
      pausedReason: null,
    },
    // Playing, so the tests about other columns are not distracted by an activity
    // warning. The activity states have their own suite.
    activity: { state: "playing", lastPlayedAt: "2026-07-29T12:00:00.000Z", daysSince: 0 },
    history: { snapshots: 4, events: 2, medals: 0 },
    role,
    active: true,
    joinedAt: "2025-10-01T00:00:00.000Z",
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

    // Exact name, not a substring: the sortable column header is also called "Cargo"
    // (as "Cargo: ordenar ..."), so /Cargo/ now matches two controls. The two accessible
    // names are distinct on purpose — see the assertion in "cabeçalhos ordenáveis".
    await user.click(screen.getByRole("button", { name: "Cargo" }));
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
  /** `at` is the last SUCCESSFUL read — what the header is built on. */
  function read(nickname: string, at: string | null): AdminMember {
    const base = member(nickname, "member", "ea");
    return { ...base, sync: { ...base.sync, readAt: at } };
  }

  it("reports the newest successful read across the whole roster", () => {
    // Newest, not oldest: the question is "is the collection working", and one
    // member stuck at the back of the queue does not mean it stopped.
    vi.useFakeTimers();
    try {
      const now = new Date("2026-07-28T12:00:00Z");
      vi.setSystemTime(now);
      render(
        <MembersTable
          members={[
            read("Antigo", "2026-07-28T09:00:00.000Z"),
            read("Recente", "2026-07-28T11:56:00.000Z"),
            read("Nunca", null),
          ]}
          medals={[]}
        />,
      );

      expect(screen.getByText(/Última coleta de dados há 4 min/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("counts reads, not attempts — an outage must not read as fresh", () => {
    // `statsCheckedAt` moves on every attempt INCLUDING failures. A header built
    // on it would report "há 1 min" straight through a total outage, which is
    // the exact opposite of what this line exists to tell an admin.
    const base = member("Panzer", "member", "ea");
    render(
      <MembersTable
        members={[
          {
            ...base,
            sync: {
              ...base.sync,
              checkedAt: new Date().toISOString(), // tried just now...
              readAt: null, // ...and never once succeeded
            },
          },
        ]}
        medals={[]}
      />,
    );

    expect(screen.getByText("A coleta ainda não rodou")).toBeInTheDocument();
  });

  it("keeps counting while the panel stays open", async () => {
    // Computed once at render, the label froze at "há 1 min" while the real gap
    // grew. A frozen relative time is worse than none: it reads as fresh.
    vi.useFakeTimers();
    try {
      const start = new Date("2026-07-28T12:00:00Z");
      vi.setSystemTime(start);
      render(<MembersTable members={[read("Panzer", "2026-07-28T11:59:00.000Z")]} medals={[]} />);
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
    render(<MembersTable members={[read("Panzer", null)]} medals={[]} />);
    expect(screen.getByText("A coleta ainda não rodou")).toBeInTheDocument();
  });
});

/**
 * The Ações column lives under `md:table-fixed`, so its width is a hard budget: a cell
 * does not grow for its content, it clips and the content spills over the next column.
 * That is how the delete trigger ended up rendering outside the column on 2026-07-29.
 * These lock what the column actually contains, so the width can be reasoned about.
 */
describe("MembersTable — coluna Ações", () => {
  function actionsOf(nickname: string) {
    const row = screen
      .getAllByRole("row")
      .find((candidate) => candidate.textContent?.includes(nickname))!;
    return {
      edit: row.querySelector(`[aria-label="Editar ${nickname}"]`),
      remove: row.querySelector(`[aria-label="Excluir ${nickname}"]`),
      medals: row.querySelector(`[aria-label="Medalhas de ${nickname}"]`),
      invite: row.querySelector(`[aria-label="Gerar convite para ${nickname}"]`),
    };
  }

  it("gives every row edit, delete and medals", () => {
    renderTable();
    const actions = actionsOf("Panzer");

    expect(actions.edit).not.toBeNull();
    expect(actions.remove).not.toBeNull();
    expect(actions.medals).not.toBeNull();
  });

  it("names the icon-only controls, since the labels were dropped", () => {
    // The words went away for width; the accessible names carry the meaning they
    // carried, so the buttons stay reachable by screen reader and show a tooltip.
    renderTable();

    expect(screen.getByRole("button", { name: "Editar Panzer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excluir Panzer" })).toBeInTheDocument();
  });

  it("offers the invite only to a member with no account", () => {
    renderTable([
      { ...member("ComConta", "member", "ea"), hasAccount: true },
      { ...member("SemConta", "member", "ea"), hasAccount: false },
    ]);

    expect(actionsOf("ComConta").invite).toBeNull();
    expect(actionsOf("SemConta").invite).not.toBeNull();
    // And the other controls are there either way: the slot is reserved, not skipped,
    // so the rows still line up.
    expect(actionsOf("ComConta").edit).not.toBeNull();
    expect(actionsOf("ComConta").remove).not.toBeNull();
  });
});

describe("MembersTable — coluna Entrou", () => {
  it("formats the join date in UTC, never shifting it a day back", () => {
    // `joinedAt` is a date-only column, so Postgres returns midnight UTC. Formatting
    // in any Brazilian timezone would render 30/09 for a member who joined on 01/10 —
    // and this is the column an admin cross-checks against the import spreadsheet.
    renderTable([{ ...member("Panzer", "member", "ea"), joinedAt: "2025-10-01T00:00:00.000Z" }]);

    expect(screen.getByText("01/10/2025")).toBeInTheDocument();
    expect(screen.queryByText("30/09/2025")).not.toBeInTheDocument();
  });

  it("shows a dash when the member has no join date", () => {
    // Real case: the v1 import did not carry one for every member. A blank cell would
    // read as a rendering bug.
    renderTable([{ ...member("SemData", "member", "ea"), joinedAt: null }]);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("MembersTable — cabeçalhos ordenáveis", () => {
  const rows = [
    member("Carlos", "member", "ea"),
    member("Ana", "admin", "xbox"),
    member("Bruno", "officer", "psn"),
  ];

  function head(name: RegExp) {
    return screen.getByRole("button", { name });
  }

  it("offers a sort on member, cargo, entrou, atividade and stats", () => {
    renderTable(rows);

    for (const label of [/^Membro:/, /^Cargo:/, /^Entrou:/, /^Atividade:/, /^Stats:/]) {
      expect(head(label)).toBeInTheDocument();
    }
  });

  it("keeps the sort header distinguishable from the filter of the same name", () => {
    // The toolbar filter is also called "Cargo". Sharing one accessible name would make
    // both controls ambiguous to a screen reader and to any query.
    renderTable(rows);

    expect(screen.getByRole("button", { name: "Cargo" })).toBeInTheDocument();
    expect(head(/^Cargo: ordenar/)).toBeInTheDocument();
  });

  it("sorts by nickname and reverses on a second click", async () => {
    const user = userEvent.setup();
    renderTable(rows);

    await user.click(head(/^Membro:/));
    expect(rowNames()).toEqual(["Ana", "Bruno", "Carlos"]);

    await user.click(head(/^Membro:/));
    expect(rowNames()).toEqual(["Carlos", "Bruno", "Ana"]);
  });

  it("returns to the default order on the third click", async () => {
    // "Off" is a state on purpose: without it the only way back is reloading the page.
    const user = userEvent.setup();
    renderTable(rows);
    const before = rowNames();

    await user.click(head(/^Membro:/));
    await user.click(head(/^Membro:/));
    await user.click(head(/^Membro:/));

    expect(rowNames()).toEqual(before);
  });

  it("sorts cargo by hierarchy, not alphabetically", async () => {
    const user = userEvent.setup();
    renderTable(rows);

    await user.click(head(/^Cargo: ordenar/));

    // member, officer, admin — alphabetical would have started at "admin".
    expect(rowNames()).toEqual(["Carlos", "Bruno", "Ana"]);
  });

  it("announces the order with aria-sort, not only with an icon", async () => {
    const user = userEvent.setup();
    renderTable(rows);

    const column = head(/^Membro:/).closest("th")!;
    expect(column).toHaveAttribute("aria-sort", "none");

    await user.click(head(/^Membro:/));
    expect(column).toHaveAttribute("aria-sort", "ascending");

    await user.click(head(/^Membro:/));
    expect(column).toHaveAttribute("aria-sort", "descending");
  });

  it("holds only one sort at a time, so two columns never both claim it", async () => {
    // The reason the Stats toggle became part of a single state: five independent ones
    // would have no answer to "sorted by Cargo AND by Entrou, which wins".
    const user = userEvent.setup();
    renderTable(rows);

    await user.click(head(/^Membro:/));
    await user.click(head(/^Cargo: ordenar/));

    expect(head(/^Membro:/).closest("th")).toHaveAttribute("aria-sort", "none");
    expect(head(/^Cargo: ordenar/).closest("th")).toHaveAttribute("aria-sort", "ascending");
  });
});
