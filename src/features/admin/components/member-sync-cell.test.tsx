import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test-utils";

import type { MemberSync } from "../lib/queries";

const toggleMemberStatsAction = vi.fn();
vi.mock("../lib/actions", () => ({ toggleMemberStatsAction }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { MemberSyncCell } = await import("./member-sync-cell");

function sync(overrides: Partial<MemberSync> = {}): MemberSync {
  return { state: "ok", checkedAt: null, canPause: true, paused: false, ...overrides };
}

function renderCell(overrides: Partial<MemberSync> = {}) {
  const onChanged = vi.fn();
  render(
    <MemberSyncCell memberId="m1" nickname="Panzer" sync={sync(overrides)} onChanged={onChanged} />,
  );
  return { onChanged };
}

beforeEach(() => {
  vi.clearAllMocks();
  toggleMemberStatsAction.mockResolvedValue({ ok: true, data: undefined });
});

describe("state labels", () => {
  // Each state has to say something an admin can act on. "Stats pendentes", the
  // single badge this replaces, said only that something was off.
  it.each([
    ["ok", "Sincronizando"],
    ["waiting", "Aguardando"],
    ["identity_pending", "ID não encontrado"],
    ["no_data", "Sem dados de BF6"],
    ["paused", "Pausado"],
    ["off", "Fora da coleta"],
  ] as const)("shows %s as %s", (state, text) => {
    renderCell({ state });
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("separates a wrong id from an id that matched the wrong account", () => {
    // Two different fixes: one is a typo, the other is a namesake collision.
    renderCell({ state: "identity_pending" });
    expect(screen.getByTitle(/não corresponde a nenhuma conta EA/i)).toBeInTheDocument();

    renderCell({ state: "no_data" });
    expect(screen.getByTitle(/casou com OUTRA conta de mesmo nome/i)).toBeInTheDocument();
  });
});

describe("last attempt", () => {
  it("shows how long ago the collector last tried", () => {
    // A green badge with a two-day-old check is a stalled sync, and without the
    // timestamp it reads as healthy.
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    renderCell({ state: "ok", checkedAt: twoHoursAgo });
    expect(screen.getByText("há 2 h")).toBeInTheDocument();
  });

  it("says nothing when there was never an attempt", () => {
    renderCell({ state: "waiting", checkedAt: null });
    expect(screen.queryByText(/^há /)).not.toBeInTheDocument();
  });
});

describe("pause toggle", () => {
  it("pauses a collecting member", async () => {
    const user = userEvent.setup();
    const { onChanged } = renderCell({ state: "ok", paused: false });

    await user.click(screen.getByRole("button", { name: /pausar a coleta de Panzer/i }));

    const form = toggleMemberStatsAction.mock.calls[0][1] as FormData;
    expect(form.get("memberId")).toBe("m1");
    expect(form.get("paused")).toBe("true");
    expect(onChanged).toHaveBeenCalled();
  });

  it("resumes a paused member", async () => {
    const user = userEvent.setup();
    renderCell({ state: "paused", paused: true });

    await user.click(screen.getByRole("button", { name: /retomar a coleta de Panzer/i }));

    expect((toggleMemberStatsAction.mock.calls[0][1] as FormData).get("paused")).toBe("false");
  });

  it("hides the toggle when the member is out of the collection anyway", () => {
    // Pausing something the collector already ignores would be a lie of a control.
    renderCell({ state: "off", canPause: false });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("does not report success when the action fails", async () => {
    const user = userEvent.setup();
    toggleMemberStatsAction.mockResolvedValue({ ok: false, error: "Membro não encontrado." });
    const { onChanged } = renderCell({ state: "ok" });

    await user.click(screen.getByRole("button", { name: /pausar/i }));

    expect(onChanged).not.toHaveBeenCalled();
  });
});
