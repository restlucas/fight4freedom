import { describe, expect, it } from "vitest";

import { BIO_MAX_LENGTH, bioSchema } from "./schemas";

describe("bioSchema", () => {
  it("accepts a normal bio and trims it", () => {
    const parsed = bioSchema.parse({ bio: "  Jogo de support, quase sempre de noite.  " });
    expect(parsed.bio).toBe("Jogo de support, quase sempre de noite.");
  });

  it("turns an empty bio into null, so clearing the field removes it", () => {
    // `""` would satisfy a `not: null` filter and render as an empty box on the
    // public profile. See the transform's comment.
    expect(bioSchema.parse({ bio: "" }).bio).toBeNull();
    expect(bioSchema.parse({ bio: "   " }).bio).toBeNull();
  });

  it("keeps the line breaks the member typed", () => {
    // The public profile renders with `whitespace-pre-line`, so the breaks are
    // meaningful and must survive validation.
    expect(bioSchema.parse({ bio: "Linha um\nLinha dois" }).bio).toBe("Linha um\nLinha dois");
  });

  it(`rejects a bio longer than ${BIO_MAX_LENGTH} characters`, () => {
    expect(bioSchema.safeParse({ bio: "x".repeat(BIO_MAX_LENGTH) }).success).toBe(true);
    expect(bioSchema.safeParse({ bio: "x".repeat(BIO_MAX_LENGTH + 1) }).success).toBe(false);
  });

  it("rejects the shapes spam arrives in", () => {
    for (const bio of [
      "meu canal https://youtube.com/x",
      "HTTP://loja.exemplo",
      "segue lá www.exemplo.com",
    ]) {
      const parsed = bioSchema.safeParse({ bio });
      expect(parsed.success, bio).toBe(false);
    }
  });

  it("does not reject ordinary sentences that merely contain a dot", () => {
    // The pattern is a speed bump, not a domain filter: this is the trade-off it
    // buys, and the test exists so nobody "fixes" it into rejecting prose.
    expect(bioSchema.safeParse({ bio: "Jogo Conquest. Chamo no Discord." }).success).toBe(true);
  });
});
