import { describe, expect, it } from "vitest";

import { detectImageKind, MAX_IMAGE_BYTES, validateImageBytes } from "./images";

function bytes(...values: (number | string)[]): Uint8Array {
  const flat: number[] = [];
  for (const value of values) {
    if (typeof value === "string") {
      for (const char of value) flat.push(char.charCodeAt(0));
    } else {
      flat.push(value);
    }
  }
  return new Uint8Array(flat);
}

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0);
const WEBP = bytes("RIFF", 0x24, 0, 0, 0, "WEBP", "VP8 ");
const AVIF = bytes(0, 0, 0, 0x20, "ftypavif", 0, 0, 0, 0);

describe("detectImageKind", () => {
  it("recognises the four accepted formats", () => {
    expect(detectImageKind(PNG)).toBe("png");
    expect(detectImageKind(JPEG)).toBe("jpeg");
    expect(detectImageKind(WEBP)).toBe("webp");
    expect(detectImageKind(AVIF)).toBe("avif");
  });

  it("rejects SVG, which would be stored XSS", () => {
    expect(detectImageKind(bytes("<svg xmlns="))).toBeNull();
    expect(detectImageKind(bytes('<?xml version="1.0"?><svg'))).toBeNull();
  });

  it("rejects HTML dressed up as an image", () => {
    expect(detectImageKind(bytes("<!DOCTYPE html><script>"))).toBeNull();
  });

  it("is not fooled by the WEBP marker appearing elsewhere", () => {
    // Right ASCII, wrong position: not a RIFF container.
    expect(detectImageKind(bytes("XXXXXXXXWEBP"))).toBeNull();
  });

  it("handles truncated files without throwing", () => {
    expect(detectImageKind(bytes(0x89, 0x50))).toBeNull();
    expect(detectImageKind(new Uint8Array())).toBeNull();
  });
});

describe("validateImageBytes", () => {
  it("accepts a valid image", () => {
    expect(validateImageBytes(PNG)).toEqual({ ok: true, kind: "png" });
  });

  it("rejects an empty file", () => {
    const result = validateImageBytes(new Uint8Array());
    expect(result.ok).toBe(false);
  });

  it("rejects anything over the size cap", () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(PNG, 0);
    const result = validateImageBytes(big);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/1024 KB/);
  });

  it("accepts a file exactly at the cap", () => {
    const exact = new Uint8Array(MAX_IMAGE_BYTES);
    exact.set(PNG, 0);
    expect(validateImageBytes(exact).ok).toBe(true);
  });

  it("checks the size before the format, so a huge payload is cut early", () => {
    const huge = new Uint8Array(MAX_IMAGE_BYTES + 1);
    huge.set(bytes("<svg"), 0);
    const result = validateImageBytes(huge);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/máximo/);
  });

  it("does not leak what the sniffing saw", () => {
    const result = validateImageBytes(bytes("<svg xmlns="));
    if (!result.ok) expect(result.error).not.toMatch(/svg/i);
  });
});
