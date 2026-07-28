import { describe, expect, it } from "vitest";

import { MEDAL_BUCKET, storagePathFromUrl } from "./medal-storage";

const base = `https://oysrkleqysfwuiezlqkl.supabase.co/storage/v1/object/public/${MEDAL_BUCKET}`;

describe("storagePathFromUrl", () => {
  it("extracts the object path from a public URL", () => {
    expect(storagePathFromUrl(`${base}/abc-123.webp`)).toBe("abc-123.webp");
  });

  it("decodes escaped characters", () => {
    expect(storagePathFromUrl(`${base}/medalha%20nova.webp`)).toBe("medalha nova.webp");
  });

  it("returns null for a URL outside our bucket, so we never delete someone else's file", () => {
    expect(storagePathFromUrl("https://cdn.discordapp.com/x.png")).toBeNull();
    expect(
      storagePathFromUrl(
        "https://oysrkleqysfwuiezlqkl.supabase.co/storage/v1/object/public/outro/x.webp",
      ),
    ).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(storagePathFromUrl(null)).toBeNull();
    expect(storagePathFromUrl("")).toBeNull();
    expect(storagePathFromUrl(`${base}/`)).toBeNull();
  });
});
