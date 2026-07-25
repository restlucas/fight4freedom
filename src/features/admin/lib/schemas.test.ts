import { describe, expect, it } from "vitest";

import { inviteFormSchema, memberFormSchema } from "./schemas";

const validMember = {
  nickname: "Panzer",
  platform: "xbox",
  platformId: "Panzer 128",
  trackerHandle: "Panzer",
  role: "member",
  active: true,
};

describe("memberFormSchema", () => {
  it("accepts a complete member", () => {
    const parsed = memberFormSchema.parse(validMember);
    expect(parsed.nickname).toBe("Panzer");
    expect(parsed.platform).toBe("xbox");
  });

  it("trims the nickname", () => {
    expect(memberFormSchema.parse({ ...validMember, nickname: "  Panzer  " }).nickname).toBe(
      "Panzer",
    );
  });

  it("rejects a nickname that is too short or too long", () => {
    expect(memberFormSchema.safeParse({ ...validMember, nickname: "P" }).success).toBe(false);
    expect(
      memberFormSchema.safeParse({ ...validMember, nickname: "x".repeat(33) }).success,
    ).toBe(false);
  });

  it("rejects an unknown platform", () => {
    expect(memberFormSchema.safeParse({ ...validMember, platform: "steam" }).success).toBe(
      false,
    );
  });

  it("turns blank optional fields into null instead of empty strings", () => {
    const parsed = memberFormSchema.parse({
      ...validMember,
      platformId: "",
      trackerHandle: "   ",
    });
    expect(parsed.platformId).toBeNull();
    expect(parsed.trackerHandle).toBeNull();
  });

  it("only accepts the three clan cargos", () => {
    for (const role of ["member", "officer", "admin"]) {
      expect(memberFormSchema.safeParse({ ...validMember, role }).success).toBe(true);
    }
    expect(memberFormSchema.safeParse({ ...validMember, role: "owner" }).success).toBe(false);
  });

  it("coerces the active checkbox", () => {
    expect(memberFormSchema.parse({ ...validMember, active: false }).active).toBe(false);
  });
});

describe("inviteFormSchema", () => {
  const memberId = "b7cf6c36-4de6-4602-8973-47c42cb63ce5";

  it("requires a real member id", () => {
    expect(inviteFormSchema.safeParse({ memberId: "abc", grantsAdmin: false }).success).toBe(
      false,
    );
    expect(inviteFormSchema.safeParse({ memberId, grantsAdmin: false }).success).toBe(true);
  });

  it("keeps the Discord username as an optional label", () => {
    expect(
      inviteFormSchema.parse({ memberId, discordUsername: "  panzer  ", grantsAdmin: false })
        .discordUsername,
    ).toBe("panzer");
    expect(
      inviteFormSchema.parse({ memberId, discordUsername: "", grantsAdmin: false })
        .discordUsername,
    ).toBeNull();
  });

  it("defaults the admin grant to false when the checkbox is absent", () => {
    expect(
      inviteFormSchema.parse({ memberId, grantsAdmin: undefined }).grantsAdmin,
    ).toBe(false);
  });

  it("reads the admin grant when checked", () => {
    expect(inviteFormSchema.parse({ memberId, grantsAdmin: true }).grantsAdmin).toBe(true);
  });
});
