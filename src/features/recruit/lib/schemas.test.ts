import { describe, expect, it } from "vitest";

import { MIN_FILL_SECONDS, recruitFormSchema } from "./schemas";

function valid(overrides: Record<string, unknown> = {}) {
  return {
    realName: "Lucas Souza",
    whatsapp: "(11) 99999-9999",
    nickname: "Panzer",
    declaredEaName: "Panzer128",
    platform: "ea",
    ageBracket: "age_25_30",
    hasGame: "sim",
    referral: "Amigos",
    elapsedSeconds: 30,
    ...overrides,
  };
}

describe("recruitFormSchema", () => {
  it("accepts a complete candidature", () => {
    const parsed = recruitFormSchema.parse(valid());
    expect(parsed.declaredEaName).toBe("Panzer128");
    expect(parsed.hasGame).toBe("sim");
  });

  it("accepts the WhatsApp however the person types it", () => {
    // Rejecting punctuation loses a candidate over formatting. Digits are counted, not
    // matched against a pattern.
    for (const whatsapp of ["(11) 99999-9999", "11999999999", "+55 11 99999 9999"]) {
      expect(recruitFormSchema.safeParse(valid({ whatsapp })).success, whatsapp).toBe(true);
    }
  });

  it("refuses a number with too few digits to be callable", () => {
    expect(recruitFormSchema.safeParse(valid({ whatsapp: "99999" })).success).toBe(false);
  });

  it("requires the EA display name, which the Google Form never asked for", () => {
    // The field the whole page exists to collect: without it the member is created
    // unbound and the collector has nothing to search.
    expect(recruitFormSchema.safeParse(valid({ declaredEaName: "" })).success).toBe(false);
  });

  it("keeps the optional fields as null instead of empty strings", () => {
    // `""` would satisfy a `not: null` filter later and read as an answer that was given.
    const parsed = recruitFormSchema.parse(
      valid({ declaredEaUsername: "  ", discordHandle: "", referral: "" }),
    );
    expect(parsed.declaredEaUsername).toBeNull();
    expect(parsed.discordHandle).toBeNull();
    expect(parsed.referral).toBeNull();
  });

  it("rejects a platform or age bracket outside the form's options", () => {
    expect(recruitFormSchema.safeParse(valid({ platform: "steam" })).success).toBe(false);
    expect(recruitFormSchema.safeParse(valid({ ageBracket: "age_99" })).success).toBe(false);
  });

  it("rejects anything in the honeypot", () => {
    // A field a human never sees, so a value in it is a bot.
    expect(recruitFormSchema.safeParse(valid({ website: "https://spam" })).success).toBe(false);
    // Absent and empty are both what a person produces.
    expect(recruitFormSchema.safeParse(valid({ website: "" })).success).toBe(true);
  });

  it("rejects a submit faster than a person can read the questions", () => {
    expect(
      recruitFormSchema.safeParse(valid({ elapsedSeconds: MIN_FILL_SECONDS - 1 })).success,
    ).toBe(false);
    expect(recruitFormSchema.safeParse(valid({ elapsedSeconds: MIN_FILL_SECONDS })).success).toBe(
      true,
    );
  });

  it("rejects a missing or unparseable elapsed time rather than letting it through", () => {
    // The field is client-sent, so absence is the shape a script produces by not running
    // the page at all.
    expect(recruitFormSchema.safeParse(valid({ elapsedSeconds: "" })).success).toBe(false);
    expect(recruitFormSchema.safeParse(valid({ elapsedSeconds: "abc" })).success).toBe(false);
  });

  it("trims but never normalises the EA name", () => {
    // Same rule as identityClaim.declaredName: the accents, the clan tag and the casing
    // are the evidence an admin works from when EA's search finds nothing.
    const parsed = recruitFormSchema.parse(valid({ declaredEaName: "  [F4F] Fulano  " }));
    expect(parsed.declaredEaName).toBe("[F4F] Fulano");
  });
});
