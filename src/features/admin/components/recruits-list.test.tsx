import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, waitFor } from "@/test-utils";

const {
  approveRecruitAction,
  rejectRecruitAction,
  reopenRecruitAction,
  deleteRecruitAction,
  refresh,
  toast,
} = vi.hoisted(() => ({
  approveRecruitAction: vi.fn(),
  rejectRecruitAction: vi.fn(),
  reopenRecruitAction: vi.fn(),
  deleteRecruitAction: vi.fn(),
  refresh: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../lib/recruit-actions", () => ({
  approveRecruitAction,
  rejectRecruitAction,
  reopenRecruitAction,
  deleteRecruitAction,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast }));

import type { AdminRecruit } from "../lib/recruit-queries";
import { RecruitsList } from "./recruits-list";

function recruit(overrides: Partial<AdminRecruit> = {}): AdminRecruit {
  return {
    id: "r1",
    status: "pending",
    realName: "Lucas Souza",
    whatsapp: "(11) 99999-9999",
    nickname: "Panzer",
    platform: "ea",
    declaredEaName: "Panzer128",
    declaredEaUsername: null,
    discordHandle: "panzer#1",
    ageBracket: "age_25_30",
    hasGame: true,
    referral: "Amigos",
    createdAt: "2026-07-29T12:00:00.000Z",
    reviewedAt: null,
    memberId: null,
    existingMemberId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  approveRecruitAction.mockResolvedValue({ ok: true, data: { memberId: "m9" } });
  rejectRecruitAction.mockResolvedValue({ ok: true, data: undefined });
  reopenRecruitAction.mockResolvedValue({ ok: true, data: undefined });
  deleteRecruitAction.mockResolvedValue({ ok: true, data: undefined });
});

describe("RecruitsList", () => {
  it("shows every field of the application without opening anything", () => {
    // The clan owner's ask: the pertinent information visible straight away. An admin
    // reads one application and decides; nothing here is comparable across rows.
    render(<RecruitsList recruits={[recruit()]} />);

    expect(screen.getByText("Panzer")).toBeInTheDocument();
    expect(screen.getByText("Lucas Souza")).toBeInTheDocument();
    expect(screen.getByText("Panzer128")).toBeInTheDocument();
    expect(screen.getByText("(11) 99999-9999")).toBeInTheDocument();
    expect(screen.getByText("25 a 30 anos")).toBeInTheDocument();
    expect(screen.getByText("panzer#1")).toBeInTheDocument();
    expect(screen.getByText("Amigos")).toBeInTheDocument();
    expect(screen.getByText("Sim")).toBeInTheDocument();
  });

  it("labels the EA display name, which is the field the queue exists for", () => {
    render(<RecruitsList recruits={[recruit()]} />);
    expect(screen.getByText("Nome de exibição da EA")).toBeInTheDocument();
  });

  it("says plainly when the candidate only plays Battle Royale", () => {
    render(<RecruitsList recruits={[recruit({ hasGame: false })]} />);
    expect(screen.getByText("Não, só Battle Royale")).toBeInTheDocument();
  });

  it("says when a field was left blank instead of rendering nothing", () => {
    render(<RecruitsList recruits={[recruit({ discordHandle: null })]} />);
    expect(screen.getByText("não informou")).toBeInTheDocument();
  });

  it("warns about a duplicate BEFORE the buttons that would create one", () => {
    // The common case: the same person applying twice, or applying after an admin already
    // added them. Approving again creates two rows the collector binds to one EA account.
    render(<RecruitsList recruits={[recruit({ existingMemberId: "m5" })]} />);

    expect(screen.getByText(/já existe um membro com esse nome da ea/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ver o membro/i })).toHaveAttribute(
      "href",
      "/membros/m5",
    );
  });

  it("does not warn about a duplicate on an already resolved application", async () => {
    // The warning is about a decision. There is no decision left to make here.
    const user = userEvent.setup();
    render(<RecruitsList recruits={[recruit({ status: "approved", existingMemberId: "m5" })]} />);

    await user.click(screen.getByRole("tab", { name: /aprovadas/i }));

    expect(screen.getByText("Panzer")).toBeInTheDocument();
    expect(screen.queryByText(/já existe um membro/i)).not.toBeInTheDocument();
  });

  it("approves and refreshes", async () => {
    const user = userEvent.setup();
    render(<RecruitsList recruits={[recruit()]} />);

    await user.click(screen.getByRole("button", { name: /aprovar/i }));

    await waitFor(() => expect(approveRecruitAction).toHaveBeenCalled());
    const form = approveRecruitAction.mock.calls[0][1] as FormData;
    expect(form.get("recruitId")).toBe("r1");
    expect(toast.success).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it("rejects without deleting, and reports it", async () => {
    const user = userEvent.setup();
    render(<RecruitsList recruits={[recruit()]} />);

    await user.click(screen.getByRole("button", { name: /recusar/i }));

    await waitFor(() => expect(rejectRecruitAction).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalled();
  });

  it("surfaces a refusal from the server instead of pretending it worked", async () => {
    approveRecruitAction.mockResolvedValue({
      ok: false,
      error: "Essa candidatura já foi resolvida.",
    });
    const user = userEvent.setup();
    render(<RecruitsList recruits={[recruit()]} />);

    await user.click(screen.getByRole("button", { name: /aprovar/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Essa candidatura já foi resolvida."),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("offers no verbs on an approved application, only the way to the member", async () => {
    const user = userEvent.setup();
    render(<RecruitsList recruits={[recruit({ status: "approved", memberId: "m9" })]} />);

    await user.click(screen.getByRole("tab", { name: /aprovadas/i }));

    expect(screen.queryByRole("button", { name: /aprovar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /recusar/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ver membro/i })).toHaveAttribute(
      "href",
      "/membros/m9",
    );
  });

  it("points at the public form when there is nothing at all", () => {
    render(<RecruitsList recruits={[]} />);

    expect(screen.getByText(/nenhuma candidatura ainda/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "/candidatar" })).toHaveAttribute(
      "href",
      "/candidatar",
    );
  });
});

describe("RecruitsList — filtro", () => {
  const rows = [
    recruit({ id: "r1", nickname: "NaFila" }),
    recruit({ id: "r2", nickname: "JaEntrou", status: "approved", memberId: "m9" }),
    recruit({ id: "r3", nickname: "Negada", status: "rejected" }),
  ];

  it("opens on the ones still waiting, which is the only tab that is work", () => {
    render(<RecruitsList recruits={rows} />);

    expect(screen.getByText("NaFila")).toBeInTheDocument();
    expect(screen.queryByText("JaEntrou")).not.toBeInTheDocument();
    expect(screen.queryByText("Negada")).not.toBeInTheDocument();
  });

  it("counts each tab from the whole list, so switching never hides the number", () => {
    render(<RecruitsList recruits={rows} />);

    for (const label of [/em aberto/i, /aprovadas/i, /recusadas/i]) {
      expect(screen.getByRole("tab", { name: label })).toHaveTextContent("1");
    }
  });

  it("switches to the rejected ones", async () => {
    const user = userEvent.setup();
    render(<RecruitsList recruits={rows} />);

    await user.click(screen.getByRole("tab", { name: /recusadas/i }));

    expect(screen.getByText("Negada")).toBeInTheDocument();
    expect(screen.queryByText("NaFila")).not.toBeInTheDocument();
  });

  it("says which tab is empty instead of claiming there is nothing at all", async () => {
    // "Nenhuma candidatura ainda" on a filtered view would read as data loss.
    const user = userEvent.setup();
    render(<RecruitsList recruits={[recruit()]} />);

    await user.click(screen.getByRole("tab", { name: /recusadas/i }));

    expect(screen.getByText(/nenhuma candidatura recusadas/i)).toBeInTheDocument();
    expect(screen.queryByText(/nenhuma candidatura ainda/i)).not.toBeInTheDocument();
  });
});

describe("RecruitsList — candidatura recusada", () => {
  const rejected = recruit({ status: "rejected" });

  async function openRejected() {
    const user = userEvent.setup();
    render(<RecruitsList recruits={[rejected]} />);
    await user.click(screen.getByRole("tab", { name: /recusadas/i }));
    return user;
  }

  it("can be put back in the queue", async () => {
    // "Volte quando comprar o jogo" is a real answer, and the answers they already gave
    // are the ones worth keeping when they come back.
    const user = await openRejected();

    await user.click(screen.getByRole("button", { name: /retomar/i }));

    await waitFor(() => expect(reopenRecruitAction).toHaveBeenCalled());
    const form = reopenRecruitAction.mock.calls[0][1] as FormData;
    expect(form.get("recruitId")).toBe("r1");
    expect(refresh).toHaveBeenCalled();
  });

  it("can be deleted for good", async () => {
    const user = await openRejected();

    await user.click(screen.getByRole("button", { name: /excluir/i }));

    await waitFor(() => expect(deleteRecruitAction).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalled();
  });

  it("offers neither approve nor reject, which belong to the open queue", async () => {
    await openRejected();

    expect(screen.queryByRole("button", { name: /aprovar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^recusar$/i })).not.toBeInTheDocument();
  });

  it("surfaces a refusal instead of pretending the row moved", async () => {
    reopenRecruitAction.mockResolvedValue({
      ok: false,
      error: "Só é possível retomar uma candidatura recusada.",
    });
    const user = await openRejected();

    await user.click(screen.getByRole("button", { name: /retomar/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Só é possível retomar uma candidatura recusada."),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
