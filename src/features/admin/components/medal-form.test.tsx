import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test-utils";

// The real actions pull in Prisma and sharp; the form only needs them to exist.
vi.mock("@/features/admin/lib/medal-actions", () => ({
  createMedalAction: vi.fn(),
  updateMedalAction: vi.fn(),
}));

import { Dialog, DialogContent } from "@/components/ui/dialog";

import { MedalForm } from "./medal-form";

/** The form always lives inside a Dialog (DialogClose needs that context). */
function renderForm(props: { storageEnabled: boolean }) {
  return render(
    <Dialog open>
      <DialogContent>
        <MedalForm storageEnabled={props.storageEnabled} onDone={() => {}} />
      </DialogContent>
    </Dialog>,
  );
}

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
});
