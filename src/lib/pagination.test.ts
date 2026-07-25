import { describe, expect, it } from "vitest";

import { isPageSize, paginate } from "./pagination";

describe("paginate", () => {
  it("describes the first page of a full list", () => {
    expect(paginate(42, 1, 10)).toMatchObject({
      page: 1,
      pageCount: 5,
      start: 0,
      end: 10,
      from: 1,
      to: 10,
    });
  });

  it("stops the last page at the total", () => {
    expect(paginate(42, 5, 10)).toMatchObject({
      page: 5,
      start: 40,
      end: 42,
      from: 41,
      to: 42,
    });
  });

  it("clamps a page beyond the end, which is what filtering causes", () => {
    expect(paginate(3, 9, 10).page).toBe(1);
    expect(paginate(30, 9, 10).page).toBe(3);
  });

  it("clamps zero and negative pages", () => {
    expect(paginate(30, 0, 10).page).toBe(1);
    expect(paginate(30, -4, 10).page).toBe(1);
  });

  it("keeps one page and zero labels for an empty list", () => {
    expect(paginate(0, 1, 10)).toMatchObject({
      page: 1,
      pageCount: 1,
      start: 0,
      end: 0,
      from: 0,
      to: 0,
    });
  });
});

describe("isPageSize", () => {
  it("accepts the offered sizes only", () => {
    expect(isPageSize(25)).toBe(true);
    expect(isPageSize(11)).toBe(false);
    expect(isPageSize("25")).toBe(false);
    expect(isPageSize(null)).toBe(false);
  });
});
