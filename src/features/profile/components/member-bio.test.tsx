import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, waitFor } from "@/test-utils";

// The real action pulls in Prisma and the session; the component only needs it to
// exist.
const { updateBioAction } = vi.hoisted(() => ({ updateBioAction: vi.fn() }));

vi.mock("../lib/actions", () => ({ updateBioAction }));

import { BIO_MAX_LENGTH } from "../lib/schemas";
import { MemberBio } from "./member-bio";

beforeEach(() => {
  vi.clearAllMocks();
  updateBioAction.mockResolvedValue({ ok: true, data: { bio: "Jogo de noite." } });
});

describe("MemberBio, on someone else's profile", () => {
  it("renders the bio as plain text, with no way in", () => {
    render(<MemberBio bio="Jogo de support." canEdit={false} />);

    expect(screen.getByText("Jogo de support.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders nothing when there is no bio", () => {
    // No "sem bio ainda" placeholder: it would announce a hole the visitor cannot
    // fill. See the component.
    const { container } = render(<MemberBio bio={null} canEdit={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("MemberBio, on my own profile", () => {
  it("invites the owner to add one when the bio is empty", () => {
    render(<MemberBio bio={null} canEdit />);

    expect(screen.getByRole("button", { name: "Adicionar uma bio" })).toBeInTheDocument();
    expect(screen.getByText("Adicione uma bio")).toBeInTheDocument();
  });

  it("shows the bio with an edit affordance when there is one", () => {
    render(<MemberBio bio="Jogo de support." canEdit />);

    expect(screen.getByRole("button", { name: "Editar sua bio" })).toBeInTheDocument();
    expect(screen.getByText("Jogo de support.")).toBeInTheDocument();
    // Not a field until it is clicked.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("turns into a field prefilled with the current bio when clicked", async () => {
    const user = userEvent.setup();
    render(<MemberBio bio="Jogo de support." canEdit />);

    await user.click(screen.getByRole("button", { name: "Editar sua bio" }));

    expect(screen.getByLabelText("Sua bio")).toHaveValue("Jogo de support.");
  });

  it("offers exactly two controls while editing", async () => {
    // The design is deliberately down to this: a field, save, cancel. A test because
    // "minimal" is the requirement, so anything added here should have to argue with
    // a red suite first.
    const user = userEvent.setup();
    render(<MemberBio bio="Jogo de support." canEdit />);

    await user.click(screen.getByRole("button", { name: "Editar sua bio" }));

    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Salvar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    // The character counter and the "sem links" hint were dropped for size.
    expect(screen.queryByText(new RegExp(`/${BIO_MAX_LENGTH}`))).not.toBeInTheDocument();
    expect(screen.queryByText(/sem links/i)).not.toBeInTheDocument();
  });

  it("saves the draft and goes back to reading, showing the saved value", async () => {
    const user = userEvent.setup();
    render(<MemberBio bio={null} canEdit />);

    await user.click(screen.getByRole("button", { name: "Adicionar uma bio" }));
    await user.type(screen.getByLabelText("Sua bio"), "Jogo de noite.");
    await user.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() => expect(updateBioAction).toHaveBeenCalled());
    const formData = updateBioAction.mock.calls[0][1] as FormData;
    expect(formData.get("bio")).toBe("Jogo de noite.");

    // Editor closed, and the value on screen is the one the action returned.
    expect(await screen.findByRole("button", { name: "Editar sua bio" })).toBeInTheDocument();
    expect(screen.getByText("Jogo de noite.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("falls back to the invitation when a save cleared the bio", async () => {
    updateBioAction.mockResolvedValue({ ok: true, data: { bio: null } });
    const user = userEvent.setup();
    render(<MemberBio bio="Texto antigo." canEdit />);

    await user.click(screen.getByRole("button", { name: "Editar sua bio" }));
    await user.clear(screen.getByLabelText("Sua bio"));
    await user.click(screen.getByRole("button", { name: /salvar/i }));

    expect(await screen.findByRole("button", { name: "Adicionar uma bio" })).toBeInTheDocument();
    expect(screen.queryByText("Texto antigo.")).not.toBeInTheDocument();
  });

  it("discards the draft on cancel and never posts it", async () => {
    const user = userEvent.setup();
    render(<MemberBio bio="Jogo de support." canEdit />);

    await user.click(screen.getByRole("button", { name: "Editar sua bio" }));
    await user.clear(screen.getByLabelText("Sua bio"));
    await user.type(screen.getByLabelText("Sua bio"), "rascunho jogado fora");
    await user.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(updateBioAction).not.toHaveBeenCalled();
    expect(screen.getByText("Jogo de support.")).toBeInTheDocument();

    // Reopening starts from the saved value, not from the abandoned draft.
    await user.click(screen.getByRole("button", { name: "Editar sua bio" }));
    expect(screen.getByLabelText("Sua bio")).toHaveValue("Jogo de support.");
  });

  it("keeps the editor open and shows the field error when the server rejects", async () => {
    updateBioAction.mockResolvedValue({
      ok: false,
      error: "Confira o texto.",
      fieldErrors: { bio: ["Links não são permitidos na bio"] },
    });
    const user = userEvent.setup();
    render(<MemberBio bio={null} canEdit />);

    await user.click(screen.getByRole("button", { name: "Adicionar uma bio" }));
    await user.type(screen.getByLabelText("Sua bio"), "www.exemplo.com");
    await user.click(screen.getByRole("button", { name: /salvar/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Links não são permitidos na bio");
    expect(alert).not.toHaveTextContent("Confira o texto.");
    // Still editing: a rejection that closed the editor would discard the text.
    expect(screen.getByLabelText("Sua bio")).toHaveValue("www.exemplo.com");
    expect(screen.getByLabelText("Sua bio")).toHaveAttribute("aria-invalid", "true");
  });

  it("falls back to the form-level error when there is no field error", async () => {
    updateBioAction.mockResolvedValue({ ok: false, error: "Membro não encontrado." });
    const user = userEvent.setup();
    render(<MemberBio bio={null} canEdit />);

    await user.click(screen.getByRole("button", { name: "Adicionar uma bio" }));
    await user.click(screen.getByRole("button", { name: /salvar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Membro não encontrado.");
  });

  it("caps the draft at the limit, so a long paragraph is never lost to a rejection", async () => {
    const user = userEvent.setup();
    render(<MemberBio bio={null} canEdit />);

    await user.click(screen.getByRole("button", { name: "Adicionar uma bio" }));
    const field = screen.getByLabelText("Sua bio");
    // Pasted rather than typed: `type` sends one keystroke per character.
    await user.click(field);
    await user.paste("x".repeat(BIO_MAX_LENGTH + 5));

    expect(field).toHaveValue("x".repeat(BIO_MAX_LENGTH));
  });
});
