import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, waitFor } from "@/test-utils";

// The real action pulls in Prisma and the session; the dialog only needs it to exist.
const { deleteMemberAction, toast } = vi.hoisted(() => ({
  deleteMemberAction: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../lib/actions", () => ({ deleteMemberAction }));
vi.mock("sonner", () => ({ toast }));

import type { AdminMember } from "../lib/queries";
import { DeleteMemberDialog } from "./delete-member-dialog";

function member(overrides: Partial<AdminMember> = {}): AdminMember {
  return {
    id: "m1",
    nickname: "RRRRRRRREST",
    platform: "ea",
    platformId: null,
    eaName: null,
    eaUsername: null,
    statsLinked: true,
    sync: {
      state: "ok",
      checkedAt: null,
      readAt: null,
      lastAttemptFailed: false,
      canPause: true,
      paused: false,
      helpRequestedAt: null,
      pausedReason: null,
    },
    activity: { state: "playing", lastPlayedAt: "2026-07-29T12:00:00.000Z", daysSince: 0 },
    history: { snapshots: 412, events: 37, medals: 3 },
    role: "member",
    active: true,
    joinedAt: "2025-10-01T00:00:00.000Z",
    avatarUrl: null,
    discordId: null,
    hasAccount: false,
    isAdmin: false,
    pendingInvite: null,
    awards: [],
    ...overrides,
  };
}

async function open(props: Partial<AdminMember> = {}) {
  const user = userEvent.setup();
  render(<DeleteMemberDialog member={member(props)} onDeleted={() => {}} />);
  await user.click(screen.getByRole("button", { name: /excluir RRRRRRRREST/i }));
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  deleteMemberAction.mockResolvedValue({ ok: true, data: undefined });
});

describe("DeleteMemberDialog", () => {
  it("counts what will be destroyed, instead of warning in the abstract", async () => {
    // "Isso apaga o membro" is a warning nobody reads. A number stops a hand.
    await open();

    expect(screen.getByText("412")).toBeInTheDocument();
    expect(screen.getByText(/leituras de stats/)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/medalhas concedidas/)).toBeInTheDocument();
    expect(screen.getByText("37")).toBeInTheDocument();
  });

  it("gets the singular right, so it never reads '1 leituras'", async () => {
    await open({ history: { snapshots: 1, events: 1, medals: 1 } });

    expect(screen.getByText(/leitura de stats/)).toBeInTheDocument();
    expect(screen.queryByText(/leituras de stats/)).not.toBeInTheDocument();
    expect(screen.getByText(/medalha concedida/)).toBeInTheDocument();
  });

  it("offers the reversible alternative where the decision is being made", async () => {
    // Most of the time deactivating is what the admin actually wants, and
    // documentation nobody opens at this moment does not help them.
    await open();
    expect(screen.getByText(/desativar/i)).toBeInTheDocument();
  });

  it("keeps the destructive button unreachable until the nickname matches", async () => {
    const user = await open();
    const confirm = screen.getByRole("button", { name: /excluir permanentemente/i });

    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText(/para confirmar/i), "RRRRRRRRES");
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText(/para confirmar/i), "T");
    expect(confirm).toBeEnabled();
  });

  it("does not accept a nickname that only differs in case", async () => {
    // The action compares exactly, so accepting it here would only produce a
    // rejection round trip that reads as a bug.
    const user = await open();

    await user.type(screen.getByLabelText(/para confirmar/i), "rrrrrrrrest");

    expect(screen.getByRole("button", { name: /excluir permanentemente/i })).toBeDisabled();
  });

  it("submits the id and the typed confirmation", async () => {
    const user = await open();

    await user.type(screen.getByLabelText(/para confirmar/i), "RRRRRRRREST");
    await user.click(screen.getByRole("button", { name: /excluir permanentemente/i }));

    await waitFor(() => expect(deleteMemberAction).toHaveBeenCalled());
    const form = deleteMemberAction.mock.calls[0][1] as FormData;
    expect(form.get("memberId")).toBe("m1");
    expect(form.get("confirmation")).toBe("RRRRRRRREST");
    expect(toast.success).toHaveBeenCalled();
  });

  it("keeps the dialog open and reports the error when the server refuses", async () => {
    deleteMemberAction.mockResolvedValue({ ok: false, error: "Membro não encontrado." });
    const user = await open();

    await user.type(screen.getByLabelText(/para confirmar/i), "RRRRRRRREST");
    await user.click(screen.getByRole("button", { name: /excluir permanentemente/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Membro não encontrado."));
    expect(screen.getByLabelText(/para confirmar/i)).toBeInTheDocument();
  });

  it("says the Discord login survives, when there is one", async () => {
    await open({ hasAccount: true });
    expect(screen.getByText(/não é apagado/i)).toBeInTheDocument();
  });
});
