import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test-utils";

// The row dialogs import the real actions (Prisma) and the table refreshes the
// route after a write; neither belongs in a filtering test.
vi.mock("@/features/admin/lib/actions", () => ({
  createMemberAction: vi.fn(),
  updateMemberAction: vi.fn(),
  createInviteAction: vi.fn(),
}));

vi.mock("@/features/admin/lib/award-actions", () => ({
  awardMedalAction: vi.fn(),
  revokeMedalAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import type { AdminMember } from "@/features/admin/lib/queries";

import { MembersTable } from "./members-table";

function member(
  nickname: string,
  role: AdminMember["role"],
  platform: AdminMember["platform"],
): AdminMember {
  return {
    id: `${nickname}-id`,
    nickname,
    platform,
    platformId: null,
    trackerHandle: null,
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

    expect(
      screen.getByText("Nenhum membro encontrado com esses filtros."),
    ).toBeInTheDocument();
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

    expect(
      window.localStorage.getItem("@fight4freedom/admin/members-page-size"),
    ).toBe("25");
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
