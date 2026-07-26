import { describe, expect, it } from "vitest";

import {
  awardFormSchema,
  awardKeySchema,
  fieldErrorsOf,
  inviteFormSchema,
  memberFormSchema,
} from "./schemas";

const validMember = {
  nickname: "Panzer",
  platform: "xbox",
  platformId: "Panzer 128",
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
      platformId: "   ",
    });
    expect(parsed.platformId).toBeNull();
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

describe("awardFormSchema", () => {
  const memberId = "b7cf6c36-4de6-4602-8973-47c42cb63ce5";
  const medalId = "0f2f1d5b-1f7e-4f2a-9a3e-2c9d6a8b4f11";

  it("accepts a grant without a note", () => {
    const parsed = awardFormSchema.parse({ memberId, medalId });
    expect(parsed.note).toBeNull();
  });

  it("trims the note and turns a blank one into null", () => {
    expect(awardFormSchema.parse({ memberId, medalId, note: "  20 kills  " }).note).toBe(
      "20 kills",
    );
    expect(awardFormSchema.parse({ memberId, medalId, note: "   " }).note).toBeNull();
  });

  it("rejects a note longer than 140 characters", () => {
    expect(
      awardFormSchema.safeParse({ memberId, medalId, note: "x".repeat(141) }).success,
    ).toBe(false);
  });

  it("rejects ids that are not uuids", () => {
    expect(awardFormSchema.safeParse({ memberId: "1", medalId }).success).toBe(false);
    expect(awardFormSchema.safeParse({ memberId, medalId: "1" }).success).toBe(false);
  });

  it("revoking needs only the member/medal pair", () => {
    const parsed = awardKeySchema.parse({ memberId, medalId, note: "ignored" });
    expect(parsed).toEqual({ memberId, medalId });
  });
});

describe("fieldErrorsOf", () => {
  it("groups messages by the first path segment", () => {
    const result = fieldErrorsOf({
      issues: [
        { path: ["note"], message: "muito longa" },
        { path: ["memberId"], message: "Membro inválido" },
        { path: ["note"], message: "outra" },
      ],
    });
    expect(result).toEqual({
      note: ["muito longa", "outra"],
      memberId: ["Membro inválido"],
    });
  });

  it("files a top-level issue under form", () => {
    expect(fieldErrorsOf({ issues: [{ path: [], message: "erro" }] })).toEqual({
      form: ["erro"],
    });
  });
});
