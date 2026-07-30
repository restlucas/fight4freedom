import { describe, expect, it } from "vitest";

import { formatWhatsapp } from "./whatsapp";

describe("formatWhatsapp", () => {
  it("builds the mask progressively as digits arrive", () => {
    expect(formatWhatsapp("")).toBe("");
    expect(formatWhatsapp("1")).toBe("(1");
    expect(formatWhatsapp("11")).toBe("(11");
    expect(formatWhatsapp("119")).toBe("(11) 9");
    expect(formatWhatsapp("119999")).toBe("(11) 9999");
    expect(formatWhatsapp("1199999")).toBe("(11) 9999-9");
  });

  it("splits eleven digits 5-4, which is the mobile shape", () => {
    expect(formatWhatsapp("11999998888")).toBe("(11) 99999-8888");
  });

  it("splits ten digits 4-4, because landlines exist", () => {
    // Forcing the mobile shape here would render `(11) 33334-444`, which is not a number.
    expect(formatWhatsapp("1133334444")).toBe("(11) 3333-4444");
  });

  it("does not flicker a landline through the mobile layout while typing", () => {
    // The split only moves once the eleventh digit is actually there.
    expect(formatWhatsapp("113333444")).toBe("(11) 3333-444");
  });

  it("ignores whatever punctuation the person types or pastes", () => {
    expect(formatWhatsapp("(11) 99999-8888")).toBe("(11) 99999-8888");
    expect(formatWhatsapp("11 9 9999 8888")).toBe("(11) 99999-8888");
    expect(formatWhatsapp("abc11def99999ghi8888")).toBe("(11) 99999-8888");
  });

  it("drops digits past the eleventh instead of appending them", () => {
    // A longer string is a paste carrying a country code; keeping it would produce a
    // number nobody can dial.
    expect(formatWhatsapp("119999988889999")).toBe("(11) 99999-8888");
  });

  it("is idempotent, so re-masking its own output changes nothing", () => {
    const once = formatWhatsapp("11999998888");
    expect(formatWhatsapp(once)).toBe(once);
  });
});
