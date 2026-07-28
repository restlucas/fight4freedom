import { describe, expect, it } from "vitest";

import { eaLookupName } from "./identity";

describe("eaLookupName", () => {
  it("prefers the EA name once it is informed", () => {
    expect(eaLookupName({ eaName: "morpheus98", platformId: "Willam_PSN" })).toBe("morpheus98");
  });

  it("falls back to the platform id for rows predating the split", () => {
    // The 76 members already resolving on 2026-07-28 did so through platformId,
    // which means that value IS their EA display name. Without this fallback the
    // whole roster would have unbound on the day the column appeared.
    expect(eaLookupName({ eaName: null, platformId: "RRRRRRRREST" })).toBe("RRRRRRRREST");
  });

  it("is null when there is nothing to search for", () => {
    expect(eaLookupName({ eaName: null, platformId: null })).toBeNull();
  });

  it("does not treat an absent field as a reason to skip the fallback", () => {
    expect(eaLookupName({ platformId: "weniobr" })).toBe("weniobr");
  });
});
