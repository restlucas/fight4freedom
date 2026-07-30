import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, waitFor } from "@/test-utils";

const { submitRecruitAction } = vi.hoisted(() => ({ submitRecruitAction: vi.fn() }));
vi.mock("../lib/actions", () => ({ submitRecruitAction }));

import { RecruitForm } from "./recruit-form";

beforeEach(() => {
  vi.clearAllMocks();
  submitRecruitAction.mockResolvedValue({ ok: true, data: undefined });
});

/** Fills everything the form needs, so a submit reaches the action. */
async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText("Sim"));
  await user.type(screen.getByLabelText("Qual seu nome?"), "Lucas Souza");
  await user.type(screen.getByLabelText("Qual seu WhatsApp?"), "11999998888");
  await user.type(screen.getByLabelText("Qual seu nick no jogo?"), "Panzer");
  await user.click(screen.getByLabelText("PC"));
  await user.click(screen.getByLabelText("25 a 30 anos"));
  // Pasted, not typed: `userEvent.type` reads `[` as key syntax and would swallow the
  // clan tag — which is the exact character this test is about.
  await user.click(screen.getByLabelText(/nome de exibição da EA/i));
  await user.paste("[F4F] Panzer");
}

describe("RecruitForm", () => {
  it("masks the WhatsApp as it is typed", async () => {
    const user = userEvent.setup();
    render(<RecruitForm />);

    const field = screen.getByLabelText("Qual seu WhatsApp?");
    await user.type(field, "11999998888");

    expect(field).toHaveValue("(11) 99999-8888");
  });

  it("keeps every answer on screen when the server rejects one field", async () => {
    // THE REGRESSION THIS GUARDS. React resets an uncontrolled form once a form action
    // resolves, so complaining about one field used to clear the other six — which is the
    // fastest way to make somebody give up on joining.
    submitRecruitAction.mockResolvedValue({
      ok: false,
      error: "Confira os campos destacados.",
      fieldErrors: { declaredEaName: ["Informe seu nome de exibição da EA"] },
    });
    const user = userEvent.setup();
    render(<RecruitForm />);

    await fill(user);
    await user.click(screen.getByRole("button", { name: /quero entrar/i }));

    await waitFor(() => expect(submitRecruitAction).toHaveBeenCalled());

    expect(screen.getByLabelText("Qual seu nome?")).toHaveValue("Lucas Souza");
    expect(screen.getByLabelText("Qual seu WhatsApp?")).toHaveValue("(11) 99999-8888");
    expect(screen.getByLabelText("Qual seu nick no jogo?")).toHaveValue("Panzer");
    expect(screen.getByLabelText(/nome de exibição da EA/i)).toHaveValue("[F4F] Panzer");
    // The chosen options too, not just the text.
    expect(screen.getByLabelText("PC")).toBeChecked();
    expect(screen.getByLabelText("25 a 30 anos")).toBeChecked();
    expect(screen.getByLabelText("Sim")).toBeChecked();
    // And the message is the only thing that was added.
    expect(screen.getByText("Informe seu nome de exibição da EA")).toBeInTheDocument();
  });

  it("tells the candidate to copy the EA name exactly, tag included", async () => {
    // The earlier wording told them to strip the clan tag, which is wrong whenever the tag
    // is genuinely part of the EA display name — and stripping it makes the search fail.
    render(<RecruitForm />);

    expect(screen.getByText(/EXATAMENTE como está na sua conta da EA/)).toBeInTheDocument();
    expect(screen.queryByText(/não inclua tag/i)).not.toBeInTheDocument();
  });

  it("sends what was typed, with the mask included", async () => {
    const user = userEvent.setup();
    render(<RecruitForm />);

    await fill(user);
    await user.click(screen.getByRole("button", { name: /quero entrar/i }));

    await waitFor(() => expect(submitRecruitAction).toHaveBeenCalled());
    const form = submitRecruitAction.mock.calls[0][1] as FormData;
    expect(form.get("whatsapp")).toBe("(11) 99999-8888");
    // Not normalised: the tag is part of the answer, and the accents and casing are the
    // evidence an admin works from when EA's search finds nothing.
    expect(form.get("declaredEaName")).toBe("[F4F] Panzer");
    expect(form.get("platform")).toBe("ea");
    expect(form.get("hasGame")).toBe("sim");
  });

  it("opens the free-text field only when Outro is chosen", async () => {
    const user = userEvent.setup();
    render(<RecruitForm />);

    expect(screen.queryByLabelText(/onde, especificamente/i)).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Outro"));

    expect(screen.getByLabelText(/onde, especificamente/i)).toBeInTheDocument();
  });

  it("sends the free text as the referral, not the word Outro", async () => {
    const user = userEvent.setup();
    render(<RecruitForm />);

    await fill(user);
    await user.click(screen.getByLabelText("Outro"));
    await user.type(screen.getByLabelText(/onde, especificamente/i), "Twitch do Fulano");
    await user.click(screen.getByRole("button", { name: /quero entrar/i }));

    await waitFor(() => expect(submitRecruitAction).toHaveBeenCalled());
    const form = submitRecruitAction.mock.calls[0][1] as FormData;
    expect(form.get("referral")).toBe("Twitch do Fulano");
  });

  it("confirms the submission and stops offering the form", async () => {
    const user = userEvent.setup();
    render(<RecruitForm />);

    await fill(user);
    await user.click(screen.getByRole("button", { name: /quero entrar/i }));

    expect(await screen.findByText(/candidatura enviada/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Qual seu nome?")).not.toBeInTheDocument();
  });
});
