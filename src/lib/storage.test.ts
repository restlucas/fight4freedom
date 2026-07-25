import { beforeEach, describe, expect, it } from "vitest";

import {
  readStoredJson,
  storageKey,
  STORAGE_PREFIX,
  writeStoredJson,
} from "./storage";

const isNumber = (value: unknown): value is number => typeof value === "number";

beforeEach(() => {
  window.localStorage.clear();
});

describe("storageKey", () => {
  it("namespaces every key under the app prefix", () => {
    expect(storageKey("admin-page-size")).toBe(`${STORAGE_PREFIX}/admin-page-size`);
  });
});

describe("readStoredJson / writeStoredJson", () => {
  it("round-trips a value", () => {
    writeStoredJson("page-size", 25);
    expect(readStoredJson("page-size", isNumber)).toBe(25);
  });

  it("writes under the prefixed key", () => {
    writeStoredJson("page-size", 25);
    expect(window.localStorage.getItem("@fight4freedom/page-size")).toBe("25");
    expect(window.localStorage.getItem("page-size")).toBeNull();
  });

  it("returns null when nothing is stored", () => {
    expect(readStoredJson("page-size", isNumber)).toBeNull();
  });

  it("returns null on malformed JSON instead of throwing", () => {
    window.localStorage.setItem("@fight4freedom/page-size", "{not json");
    expect(readStoredJson("page-size", isNumber)).toBeNull();
  });

  it("rejects a stored value that no longer passes the guard", () => {
    writeStoredJson("page-size", "50");
    expect(readStoredJson("page-size", isNumber)).toBeNull();
  });
});
