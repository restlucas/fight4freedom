import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { serverEnv } = vi.hoisted(() => ({
  serverEnv: { healthcheckUrl: null as string | null },
}));
vi.mock("@/lib/env", () => ({ serverEnv }));

const { healthcheckFailed, healthcheckStarted, healthcheckSucceeded } =
  await import("./healthcheck");

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  serverEnv.healthcheckUrl = "https://hc.example/ping/abc";
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** URL of the nth call, for the path assertions below. */
function urlOf(call = 0) {
  return String(fetchMock.mock.calls[call][0]);
}

describe("healthcheck", () => {
  it("pings the three conventional paths", async () => {
    // The shape any of the usual services understands with no adapter. `/fail` exists
    // so "ran and broke" never gets reported as "never ran".
    await healthcheckStarted();
    expect(urlOf()).toBe("https://hc.example/ping/abc/start");

    fetchMock.mockClear();
    await healthcheckSucceeded("2 atualizados");
    expect(urlOf()).toBe("https://hc.example/ping/abc");

    fetchMock.mockClear();
    await healthcheckFailed(new Error("boom"));
    expect(urlOf()).toBe("https://hc.example/ping/abc/fail");
  });

  it("sends the summary as the body, which is what makes the history readable", async () => {
    await healthcheckSucceeded("6 atualizados, 62 sem mudanca");

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: "6 atualizados, 62 sem mudanca",
    });
  });

  it("names the error, so the alert says what broke", async () => {
    await healthcheckFailed(new Error("connect ETIMEDOUT"));
    expect(fetchMock.mock.calls[0][1].body).toBe("Error: connect ETIMEDOUT");
  });

  it("survives a thrown value that is not an Error", async () => {
    await healthcheckFailed("string solta");
    expect(fetchMock.mock.calls[0][1].body).toBe("string solta");
  });

  it("tolerates a trailing slash on the configured URL", async () => {
    // Copy-pasted monitor URLs carry one about half the time, and `//start` is a 404
    // on every service that speaks this convention.
    serverEnv.healthcheckUrl = "https://hc.example/ping/abc/";
    await healthcheckStarted();
    expect(urlOf()).toBe("https://hc.example/ping/abc/start");
  });

  it("does nothing at all when no monitor is configured", async () => {
    // Local runs and CI have none, and the collection must behave identically with and
    // without one.
    serverEnv.healthcheckUrl = null;

    await healthcheckStarted();
    await healthcheckSucceeded("x");
    await healthcheckFailed(new Error("y"));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws when the monitor is unreachable", async () => {
    // The whole point: a healthcheck that can fail a cycle inverts its purpose — the
    // monitor becomes the outage.
    fetchMock.mockRejectedValue(new Error("ENOTFOUND"));

    await expect(healthcheckStarted()).resolves.toBeUndefined();
    await expect(healthcheckSucceeded("x")).resolves.toBeUndefined();
    await expect(healthcheckFailed(new Error("y"))).resolves.toBeUndefined();
  });
});
