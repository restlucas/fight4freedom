import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, waitFor } from "@/test-utils";

// The real actions pull in Prisma and sharp; the form only needs them to exist.
const { createMedalAction, updateMedalAction, toast } = vi.hoisted(() => ({
  createMedalAction: vi.fn(),
  updateMedalAction: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/features/admin/lib/medal-actions", () => ({
  createMedalAction,
  updateMedalAction,
}));

vi.mock("sonner", () => ({ toast }));

import { Dialog, DialogContent } from "@/components/ui/dialog";

import { MedalForm } from "./medal-form";

/** The form always lives inside a Dialog (DialogClose needs that context). */
function renderForm(props: { storageEnabled: boolean; onDone?: () => void }) {
  return render(
    <Dialog open>
      <DialogContent>
        <MedalForm
          storageEnabled={props.storageEnabled}
          onDone={props.onDone ?? (() => {})}
        />
      </DialogContent>
    </Dialog>,
  );
}

beforeEach(() => {
  // Toast and action call counts are what the tests below assert on.
  vi.clearAllMocks();
});

beforeAll(() => {
  // jsdom implements neither method. Patch them onto the real URL instead of
  // replacing the global: next/image calls `new URL()`, so swapping the whole
  // object for a literal breaks the constructor.
  URL.createObjectURL = vi.fn(() => "blob:http://localhost/fake-preview");
  URL.revokeObjectURL = vi.fn();
});

function pngFile() {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new File([bytes], "medalha.png", { type: "image/png" });
}

describe("MedalForm", () => {
  it("shows the icon fallback before any art is picked", () => {
    renderForm({ storageEnabled: true });
    expect(screen.getByText(/Prévia do emblema/)).toBeInTheDocument();
    // No <img> yet: the emblem is rendering the lucide icon.
    expect(document.querySelector("img")).toBeNull();
  });

  it("replaces the icon with the picked art", async () => {
    const user = userEvent.setup();
    renderForm({ storageEnabled: true });

    await user.upload(screen.getByLabelText("Arte"), pngFile());

    const image = document.querySelector("img");
    expect(image).not.toBeNull();
    expect(image?.getAttribute("src")).toContain("blob:");
  });

  it("disables the art field when storage is not configured", () => {
    renderForm({ storageEnabled: false });
    expect(screen.getByLabelText("Arte")).toBeDisabled();
    expect(screen.getByText(/SUPABASE_SERVICE_ROLE_KEY/)).toBeInTheDocument();
  });

  it("announces a successful creation exactly once", async () => {
    // Regression: the success toast used to fire in an effect keyed on the action
    // state with `onDone` among its dependencies. Every parent re-render handed the
    // form a fresh `onDone`, which re-ran the effect on the same success and
    // toasted again. The parent re-render is simulated here by the rerender below.
    createMedalAction.mockResolvedValue({ ok: true, data: { medalId: "abc" } });
    const user = userEvent.setup();
    const onDone = vi.fn();

    const { rerender } = renderForm({ storageEnabled: true, onDone });

    await user.type(screen.getByLabelText("Nome"), "Franco-atirador");
    await user.click(screen.getByRole("button", { name: "Criar medalha" }));

    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());

    rerender(
      <Dialog open>
        <DialogContent>
          {/* A new identity, exactly what the parent used to pass on re-render. */}
          <MedalForm storageEnabled onDone={() => onDone()} />
        </DialogContent>
      </Dialog>,
    );

    expect(toast.success).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("shows field errors next to the inputs instead of a toast", async () => {
    createMedalAction.mockResolvedValue({
      ok: false,
      error: "Confira os campos.",
      fieldErrors: { name: ["Informe o nome com pelo menos 2 caracteres"] },
    });
    const user = userEvent.setup();
    const onDone = vi.fn();

    renderForm({ storageEnabled: true, onDone });
    await user.type(screen.getByLabelText("Nome"), "F");
    await user.click(screen.getByRole("button", { name: "Criar medalha" }));

    expect(
      await screen.findByText("Informe o nome com pelo menos 2 caracteres"),
    ).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});
