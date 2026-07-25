import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, within } from "@/test-utils";

// The manager renders forms that import the real actions (Prisma, sharp) and calls
// router.refresh() after a write; neither belongs in a filtering test.
vi.mock("@/features/admin/lib/medal-actions", () => ({
  createMedalAction: vi.fn(),
  updateMedalAction: vi.fn(),
  deleteMedalAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import type { AdminMedal } from "@/features/admin/lib/queries";

import { MedalsManager } from "./medals-manager";

function medal(
  name: string,
  tier: AdminMedal["tier"],
  holders: number,
): AdminMedal {
  return {
    id: `${name}-id`,
    name,
    description: null,
    criteria: null,
    tier,
    icon: "crosshair",
    imageUrl: null,
    holders,
  };
}

const MEDALS: AdminMedal[] = [
  medal("Franco-atirador", "rare", 7),
  medal("Sobrevivente", "common", 12),
  medal("Lenda do clã", "legendary", 1),
  medal("Evento de sábado", "special", 4),
];

/** Medal names currently rendered, in row order. */
function rowNames(): string[] {
  const rows = screen.getAllByRole("row").slice(1); // drops the header row
  return rows.flatMap((row) => {
    const heading = row.querySelector("p.font-heading");
    return heading?.textContent ? [heading.textContent] : [];
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

function renderManager(medals: AdminMedal[] = MEDALS) {
  return render(<MedalsManager medals={medals} storageEnabled />);
}

describe("MedalsManager", () => {
  it("filters by name, ignoring accents and case", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.type(screen.getByLabelText("Buscar medalha"), "lenda do cla");

    expect(rowNames()).toEqual(["Lenda do clã"]);
  });

  it("says so when the filters match nothing", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.type(screen.getByLabelText("Buscar medalha"), "zzz");

    expect(
      screen.getByText("Nenhuma medalha encontrada com esses filtros."),
    ).toBeInTheDocument();
  });

  it("filters by rarity, accumulating the checked options", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getByRole("button", { name: /Raridade/ }));
    await user.click(
      screen.getByRole("menuitemcheckbox", { name: "Lendária" }),
    );
    expect(rowNames()).toEqual(["Lenda do clã"]);

    // The menu stays open, so a second rarity is one click away.
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Comum" }));
    expect(rowNames()).toEqual(["Sobrevivente", "Lenda do clã"]);
  });

  it("clears the rarity filter", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getByRole("button", { name: /Raridade/ }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Rara" }));
    expect(rowNames()).toHaveLength(1);

    await user.click(screen.getByRole("menuitem", { name: /Limpar seleção/ }));
    expect(rowNames()).toHaveLength(4);
  });

  it("sorts by awards, most first, then least, then back to the catalog order", async () => {
    const user = userEvent.setup();
    renderManager();

    const defaultOrder = rowNames();

    await user.click(screen.getByRole("button", { name: "Conquistas" }));
    expect(rowNames()).toEqual([
      "Sobrevivente",
      "Franco-atirador",
      "Evento de sábado",
      "Lenda do clã",
    ]);

    await user.click(screen.getByRole("button", { name: "Conquistas" }));
    expect(rowNames()).toEqual([
      "Lenda do clã",
      "Evento de sábado",
      "Franco-atirador",
      "Sobrevivente",
    ]);

    await user.click(screen.getByRole("button", { name: "Conquistas" }));
    expect(rowNames()).toEqual(defaultOrder);
  });

  it("paginates and remembers the page size under the app's storage prefix", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getByLabelText("Resultados por página"));
    await user.click(screen.getByRole("option", { name: "10" }));

    expect(window.localStorage.getItem("@fight4freedom/admin/medals-page-size")).toBe(
      "10",
    );
    expect(screen.getByText("1–4 de 4 medalhas")).toBeInTheDocument();
  });

  it("walks between pages", async () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      medal(`Medalha ${index + 1}`, "common", index),
    );
    window.localStorage.setItem("@fight4freedom/admin/medals-page-size", "10");

    const user = userEvent.setup();
    renderManager(many);

    expect(rowNames()).toHaveLength(10);
    expect(screen.getByText("Página 1 de 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Página anterior")).toBeDisabled();

    await user.click(screen.getByLabelText("Próxima página"));

    expect(rowNames()).toHaveLength(2);
    expect(screen.getByText("11–12 de 12 medalhas")).toBeInTheDocument();
    expect(screen.getByLabelText("Próxima página")).toBeDisabled();
  });

  it("returns to the first page when a filter narrows the list", async () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      medal(`Medalha ${index + 1}`, index === 11 ? "rare" : "common", index),
    );
    window.localStorage.setItem("@fight4freedom/admin/medals-page-size", "10");

    const user = userEvent.setup();
    renderManager(many);

    await user.click(screen.getByLabelText("Próxima página"));
    expect(screen.getByText("Página 2 de 2")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Buscar medalha"), "Medalha 1");

    expect(screen.getByText("Página 1 de 1")).toBeInTheDocument();
    expect(rowNames().length).toBeGreaterThan(0);
  });

  it("announces the sort order on the column itself", async () => {
    const user = userEvent.setup();
    renderManager();

    const header = within(screen.getAllByRole("row")[0]).getByRole("button", {
      name: "Conquistas",
    });
    const column = header.closest("th");

    expect(column).toHaveAttribute("aria-sort", "none");
    await user.click(header);
    expect(column).toHaveAttribute("aria-sort", "descending");
    await user.click(header);
    expect(column).toHaveAttribute("aria-sort", "ascending");
  });
});
