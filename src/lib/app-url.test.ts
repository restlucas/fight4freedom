import { beforeEach, describe, expect, it, vi } from "vitest";

const headersMock = vi.fn();
vi.mock("next/headers", () => ({ headers: () => headersMock() }));

import { getRequestOrigin } from "./app-url";

function withHeaders(entries: Record<string, string>) {
  headersMock.mockReturnValue({
    get: (name: string) => entries[name.toLowerCase()] ?? null,
  });
}

beforeEach(() => {
  headersMock.mockReset();
});

describe("getRequestOrigin", () => {
  it("uses the proxy headers Vercel sets", async () => {
    withHeaders({
      "x-forwarded-host": "fight4freedom.com.br",
      "x-forwarded-proto": "https",
    });
    expect(await getRequestOrigin()).toBe("https://fight4freedom.com.br");
  });

  it("prefers the forwarded host over the raw host", async () => {
    withHeaders({
      "x-forwarded-host": "fight4freedom.com.br",
      host: "internal-host:3000",
      "x-forwarded-proto": "https",
    });
    expect(await getRequestOrigin()).toBe("https://fight4freedom.com.br");
  });

  it("works on a preview deployment, whose URL changes every time", async () => {
    withHeaders({
      "x-forwarded-host": "fight4freedom-git-abc123.vercel.app",
      "x-forwarded-proto": "https",
    });
    expect(await getRequestOrigin()).toBe(
      "https://fight4freedom-git-abc123.vercel.app",
    );
  });

  it("assumes https when the proto header is missing", async () => {
    withHeaders({ host: "fight4freedom.com.br" });
    expect(await getRequestOrigin()).toBe("https://fight4freedom.com.br");
  });

  it("keeps http for local development", async () => {
    withHeaders({ host: "localhost:3000" });
    expect(await getRequestOrigin()).toBe("http://localhost:3000");
  });

  it("falls back to the env var when there is no host at all", async () => {
    withHeaders({});
    expect(await getRequestOrigin()).toBe("http://localhost:3000");
  });
});
