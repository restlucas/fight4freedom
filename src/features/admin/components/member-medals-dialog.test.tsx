import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, waitFor } from "@/test-utils";

// The real actions pull in Prisma; the dialog only needs them to resolve.
const { awardMedalAction, revokeMedalAction } = vi.hoisted(() => ({
  awardMedalAction: vi.fn(),
  revokeMedalAction: vi.fn(),
}));

vi.mock("@/features/admin/lib/award-actions", () => ({
  awardMedalAction,
  revokeMedalAction,
}));

import type { AdminMedal, AdminMember } from "@/features/admin/lib/queries";

import { MemberMedalsDialog } from "./member-medals-dialog";

const MEMBER_ID = "b7cf6c36-4de6-4602-8973-47c42cb63ce5";
const SNIPER_ID = "0f2f1d5b-1f7e-4f2a-9a3e-2c9d6a8b4f11";
const EVENT_ID = "5c1a9e7d-8b3c-4d21-9f0a-6e5b4c3d2a10";

const medals: AdminMedal[] = [
  {
    id: SNIPER_ID,
    name: "Franco-atirador",
    description: null,
    criteria: null,
    tier: "rare",
    icon: "crosshair",
    imageUrl: null,
    holders: 1,
  },
  {
    id: EVENT_ID,
    name: "Evento de sábado",
    description: null,
    criteria: null,
    tier: "special",
    icon: "star",
    imageUrl: null,
    holders: 0,
  },
];

function member(awards: AdminMember["awards"] = []): AdminMember {
  return {
    id: MEMBER_ID,
    nickname: "Panzer",
    platform: "xbox",
    platformId: "Panzer 128",
    eaName: "Panzer128",
    statsLinked: true,
    sync: { state: "ok", checkedAt: null, readAt: null, lastAttemptFailed: false, canPause: true, paused: false },
    role: "member",
    active: true,
    avatarUrl: null,
    discordId: null,
    hasAccount: true,
    isAdmin: false,
    pendingInvite: null,
    awards,
  };
}

/** Opens the dialog, which is what an admin does before anything else. */
async function open(props: { member: AdminMember; medals?: AdminMedal[]; onChanged?: () => void }) {
  const user = userEvent.setup();
  render(
    <MemberMedalsDialog
      member={props.member}
      medals={props.medals ?? medals}
      onChanged={props.onChanged ?? (() => {})}
    />,
  );
  await user.click(screen.getByRole("button", { name: /Medalhas de Panzer/ }));
  return user;
}

beforeEach(() => {
  // Call counts do not reset on their own, and every test below asserts on them.
  vi.clearAllMocks();
  awardMedalAction.mockResolvedValue({ ok: true, data: undefined });
  revokeMedalAction.mockResolvedValue({ ok: true, data: undefined });
});

describe("MemberMedalsDialog", () => {
  it("counts the member's medals on the trigger", () => {
    render(
      <MemberMedalsDialog
        member={member([{ medalId: SNIPER_ID, awardedAt: "2026-07-01T12:00:00.000Z", note: null }])}
        medals={medals}
        onChanged={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /Medalhas de Panzer/ })).toHaveTextContent("1");
  });

  it("lists an award with its date and note", async () => {
    await open({
      member: member([
        {
          medalId: SNIPER_ID,
          awardedAt: "2026-07-01T12:00:00.000Z",
          note: "24 kills sem morrer",
        },
      ]),
    });

    expect(screen.getByText("Conquistadas (1)")).toBeInTheDocument();
    expect(screen.getByText(/24 kills sem morrer/)).toBeInTheDocument();
    expect(screen.getByText(/01 de jul\. de 2026/)).toBeInTheDocument();
  });

  it("offers only medals the member does not have yet", async () => {
    await open({
      member: member([{ medalId: SNIPER_ID, awardedAt: "2026-07-01T12:00:00.000Z", note: null }]),
    });

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Evento de sábado");
  });

  it("grants the selected medal with the note", async () => {
    const onChanged = vi.fn();
    const user = await open({ member: member(), onChanged });

    await user.type(screen.getByLabelText("Nota (opcional)"), "no evento");
    await user.click(screen.getByRole("button", { name: "Conceder medalha" }));

    await waitFor(() => expect(awardMedalAction).toHaveBeenCalledOnce());
    const formData = awardMedalAction.mock.calls[0][1] as FormData;
    expect(formData.get("memberId")).toBe(MEMBER_ID);
    // First option of the select, since nothing was picked by hand.
    expect(formData.get("medalId")).toBe(SNIPER_ID);
    expect(formData.get("note")).toBe("no evento");
    expect(onChanged).toHaveBeenCalled();
  });

  it("revokes an award by the member/medal pair", async () => {
    const user = await open({
      member: member([{ medalId: SNIPER_ID, awardedAt: "2026-07-01T12:00:00.000Z", note: null }]),
    });

    await user.click(screen.getByRole("button", { name: "Remover Franco-atirador" }));

    await waitFor(() => expect(revokeMedalAction).toHaveBeenCalledOnce());
    const formData = revokeMedalAction.mock.calls[0][1] as FormData;
    expect(formData.get("memberId")).toBe(MEMBER_ID);
    expect(formData.get("medalId")).toBe(SNIPER_ID);
  });

  it("loads only the medal being removed, leaving the others clickable", async () => {
    let finish: (result: { ok: true; data: undefined }) => void = () => {};
    revokeMedalAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );

    const user = await open({
      member: member([
        { medalId: SNIPER_ID, awardedAt: "2026-07-01T12:00:00.000Z", note: null },
        { medalId: EVENT_ID, awardedAt: "2026-07-02T12:00:00.000Z", note: null },
      ]),
    });

    await user.click(screen.getByRole("button", { name: "Remover Franco-atirador" }));

    await waitFor(() =>
      expect(screen.getByRole("status", { name: "Removendo" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Remover Franco-atirador" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remover Evento de sábado" })).toBeEnabled();

    finish({ ok: true, data: undefined });
    await waitFor(() => expect(screen.queryByRole("status", { name: "Removendo" })).toBeNull());
  });

  it("keeps the failure on screen instead of pretending it worked", async () => {
    awardMedalAction.mockResolvedValue({ ok: false, error: "Medalha não encontrada." });
    const onChanged = vi.fn();
    const user = await open({ member: member(), onChanged });

    await user.click(screen.getByRole("button", { name: "Conceder medalha" }));

    await waitFor(() => expect(awardMedalAction).toHaveBeenCalledOnce());
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("says nothing is left to grant when the member has everything", async () => {
    await open({
      member: member([
        { medalId: SNIPER_ID, awardedAt: "2026-07-01T12:00:00.000Z", note: null },
        { medalId: EVENT_ID, awardedAt: "2026-07-02T12:00:00.000Z", note: null },
      ]),
    });

    expect(screen.getByText(/já tem todas as medalhas/)).toBeInTheDocument();
    expect(screen.queryByRole("option")).toBeNull();
  });

  it("points to the catalog when there are no medals at all", async () => {
    await open({ member: member(), medals: [] });
    expect(screen.getByText(/Crie uma em Medalhas primeiro/)).toBeInTheDocument();
  });

  it("ignores an award whose medal was deleted from the catalog", async () => {
    await open({
      member: member([
        { medalId: "deleted-medal", awardedAt: "2026-07-01T12:00:00.000Z", note: null },
      ]),
    });
    expect(screen.getByText("Conquistadas (0)")).toBeInTheDocument();
  });
});
