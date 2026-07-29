import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test-utils";

import type { MemberSync } from "../lib/queries";

const toggleMemberStatsAction = vi.fn();
vi.mock("../lib/actions", () => ({ toggleMemberStatsAction }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { MemberSyncCell } = await import("./member-sync-cell");

function sync(overrides: Partial<MemberSync> = {}): MemberSync {
  return {
    state: "ok",
    checkedAt: null,
    readAt: null,
    lastAttemptFailed: false,
    canPause: true,
    paused: false,
    helpRequestedAt: null,
    pausedReason: null,
    ...overrides,
  };
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
    ["waiting", "Aguardando 1ª leitura"],
    ["identity_pending", "ID não encontrado"],
    ["never_read", "Conta errada?"],
    ["no_data", "Sem retorno"],
    ["paused", "Pausado"],
    ["off", "Fora da coleta"],
  ] as const)("shows %s as %s", (state, text) => {
    renderCell({ state });
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("blames the id only when the id is provably the problem", async () => {
    // identity_pending IS a certain diagnosis: no EA account matches.
    const user = userEvent.setup();
    renderCell({ state: "identity_pending" });

    await user.hover(screen.getByRole("button", { name: /ID não encontrado: o que significa/i }));

    expect(await screen.findByText(/não corresponde a nenhuma conta EA/i)).toBeInTheDocument();
  });

  it("tells the admin what to fix when a member was NEVER read", async () => {
    // The state that exists because its absence cost days: four members had been
    // failing every cycle since registration, wearing the same badge as members
    // whose batch merely 504'd that round, so nobody looked. The copy has to name
    // the cause (wrong EA account) AND the exact field to ask the member for,
    // because "EA ID" is not the clan nick and not the console gamertag — which is
    // precisely the confusion that produced all four.
    const user = userEvent.setup();
    renderCell({ state: "never_read", readAt: null });

    await user.hover(screen.getByRole("button", { name: /Conta errada\?: o que significa/i }));

    const explanation = await screen.findByText(/NUNCA conseguiu ler/i);
    expect(explanation.textContent).toMatch(/não é instabilidade da fonte/i);
    expect(explanation.textContent).toMatch(/EA ID/i);
    expect(explanation.textContent).toMatch(/não o nick do clã nem a gamertag/i);
  });

  it("does not accuse the account when the member HAS been read before", async () => {
    // The middle case, and the reason `no_data` still exists: read successfully at
    // some point, failing now. That is a source problem or a renamed account, not
    // a wrong binding, so the copy must not send an admin hunting an id.
    const user = userEvent.setup();
    renderCell({ state: "no_data", readAt: "2026-07-28T09:00:00.000Z" });

    await user.hover(screen.getByRole("button", { name: /Sem retorno: o que significa/i }));

    const explanation = await screen.findByText(/já foi lido com sucesso antes/i);
    expect(explanation.textContent).toMatch(/instabilidade da fonte/i);
    expect(explanation.textContent).not.toMatch(/EA ID/i);
  });

  it("says nothing extra when the badge is already the whole story", () => {
    // "Sincronizando" used to carry a tooltip reading "a coleta leu os stats
    // deste membro" — a hover card that only restates the label teaches admins
    // to ignore hover cards, including the ones that carry a real caveat.
    renderCell({ state: "ok" });
    expect(screen.queryByRole("button", { name: /o que significa/i })).not.toBeInTheDocument();
  });
});

describe("a failed round on a healthy member", () => {
  it("still reads as syncing, with a warning beside it", async () => {
    // Measured 2026-07-28: 24 of the 29 members marked "Sem retorno" had stats
    // from earlier rounds. The source 504s on roughly half the batches and the
    // whole batch comes back empty, so calling them broken sent an admin hunting
    // two dozen id problems that did not exist.
    const user = userEvent.setup();
    renderCell({ state: "ok", lastAttemptFailed: true });

    expect(screen.getByText("Sincronizando")).toBeInTheDocument();
    await user.hover(screen.getByRole("button", { name: /última leitura falhou para Panzer/i }));

    expect(await screen.findByText(/continuam válidos/i)).toBeInTheDocument();
  });

  it("shows no warning when the last round went through", () => {
    renderCell({ state: "ok", lastAttemptFailed: false });
    expect(
      screen.queryByRole("button", { name: /última leitura falhou/i }),
    ).not.toBeInTheDocument();
  });
});

// The "last collection" clock used to live under every badge. It is one line
// above the table now — see members-table.test.tsx — because the collector
// sweeps everyone in the same runs, so ~100 per-row counters were ~100 copies
// of a single fact.

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
    // Pausing something the collector already ignores would be a lie of a
    // control. Named rather than "any button": the badge's own hover-card
    // trigger is a button too.
    renderCell({ state: "off", canPause: false });
    expect(
      screen.queryByRole("button", { name: /(pausar|retomar) a coleta/i }),
    ).not.toBeInTheDocument();
  });

  it("does not report success when the action fails", async () => {
    const user = userEvent.setup();
    toggleMemberStatsAction.mockResolvedValue({ ok: false, error: "Membro não encontrado." });
    const { onChanged } = renderCell({ state: "ok" });

    await user.click(screen.getByRole("button", { name: /pausar/i }));

    expect(onChanged).not.toHaveBeenCalled();
  });
});
