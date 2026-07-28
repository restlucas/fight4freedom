import { describe, expect, it } from "vitest";

import {
  generateInviteToken,
  hashInviteToken,
  INVITE_TTL_DAYS,
  inviteExpiresAt,
  inviteState,
  inviteUrl,
} from "./invite";

describe("generateInviteToken", () => {
  it("is URL-safe and long enough to be unguessable", () => {
    const token = generateInviteToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(43); // 32 bytes in base64url
  });

  it("never repeats", () => {
    const tokens = new Set(Array.from({ length: 200 }, generateInviteToken));
    expect(tokens.size).toBe(200);
  });
});

describe("hashInviteToken", () => {
  it("is deterministic, so the callback can look the token up", () => {
    expect(hashInviteToken("abc")).toBe(hashInviteToken("abc"));
  });

  it("differs per token and never returns the token itself", () => {
    const token = generateInviteToken();
    const hash = hashInviteToken(token);
    expect(hash).not.toBe(token);
    expect(hash).toHaveLength(64);
    expect(hashInviteToken(generateInviteToken())).not.toBe(hash);
  });
});

describe("inviteExpiresAt", () => {
  it("adds the TTL to the creation instant", () => {
    const from = new Date("2026-07-01T00:00:00Z");
    expect(inviteExpiresAt(from).toISOString()).toBe("2026-07-08T00:00:00.000Z");
    expect(INVITE_TTL_DAYS).toBe(7);
  });
});

describe("inviteUrl", () => {
  it("builds the absolute link the admin shares", () => {
    expect(inviteUrl("https://fight4freedom.com.br", "tok123")).toBe(
      "https://fight4freedom.com.br/convite/tok123",
    );
  });
});

describe("inviteState", () => {
  const now = new Date("2026-07-05T12:00:00Z");

  it("accepts an unused invite inside its window", () => {
    expect(inviteState({ expiresAt: new Date("2026-07-08T00:00:00Z"), usedAt: null }, now)).toBe(
      "valid",
    );
  });

  it("rejects a missing invite", () => {
    expect(inviteState(null, now)).toBe("unknown");
  });

  it("rejects one already claimed, even if still inside the window", () => {
    expect(
      inviteState(
        {
          expiresAt: new Date("2026-07-08T00:00:00Z"),
          usedAt: new Date("2026-07-02T00:00:00Z"),
        },
        now,
      ),
    ).toBe("used");
  });

  it("rejects an expired one", () => {
    expect(inviteState({ expiresAt: new Date("2026-07-04T00:00:00Z"), usedAt: null }, now)).toBe(
      "expired",
    );
  });

  it("treats the exact expiry instant as expired", () => {
    expect(inviteState({ expiresAt: now, usedAt: null }, now)).toBe("expired");
  });

  it("reports used before expired when both apply", () => {
    expect(
      inviteState(
        {
          expiresAt: new Date("2026-07-01T00:00:00Z"),
          usedAt: new Date("2026-06-30T00:00:00Z"),
        },
        now,
      ),
    ).toBe("used");
  });
});
