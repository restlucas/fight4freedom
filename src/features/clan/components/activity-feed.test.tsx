import { act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test-utils";

import { ACTIVITY_POLL_MS } from "../lib/activity";
import type { ActivityEvent } from "../lib/queries";
import { ActivityFeed } from "./activity-feed";

function session(id: string, nickname: string, updatedAt: string, points = 320): ActivityEvent {
  return {
    id,
    kind: "session",
    memberId: `m-${id}`,
    nickname,
    avatarUrl: null,
    occurredAt: updatedAt,
    updatedAt,
    points,
    minutesPlayed: 95,
    rankSlug: null,
  };
}

function promotion(id: string, nickname: string, updatedAt: string): ActivityEvent {
  return { ...session(id, nickname, updatedAt), kind: "promotion", rankSlug: "capitao" };
}

/** Stubs the polling endpoint with one payload per call. */
function mockPolls(...payloads: { events: ActivityEvent[]; cursor: string | null }[]) {
  const fetchMock = vi.fn();
  for (const payload of payloads) {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => payload });
  }
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ events: [], cursor: null }) });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ActivityFeed", () => {
  it("renders a session in the unit a player thinks in", () => {
    mockPolls();
    render(
      <ActivityFeed
        initialEvents={[session("a", "douglasccosta", "2026-07-28T22:00:00Z")]}
        limit={8}
      />,
    );

    const row = screen.getByRole("link");
    expect(row).toHaveAttribute("href", "/membros/m-a");
    expect(row).toHaveTextContent("douglasccosta");
    // 95 minutes reads as 1h35, never rounded to "2 h".
    expect(row).toHaveTextContent("1h35");
    expect(row).toHaveTextContent("320");
  });

  it("names the rank a promotion reached", () => {
    mockPolls();
    render(
      <ActivityFeed
        initialEvents={[promotion("p", "F4F WISLAN", "2026-07-28T22:00:00Z")]}
        limit={8}
      />,
    );

    expect(screen.getByRole("link")).toHaveTextContent("foi promovido a Capitão");
  });

  it("explains an empty feed instead of rendering nothing", () => {
    mockPolls();
    render(<ActivityFeed initialEvents={[]} limit={8} />);

    expect(screen.getByText("Nada por aqui nas últimas horas")).toBeInTheDocument();
    expect(screen.getByText(/a cada 20 minutos/i)).toBeInTheDocument();
  });

  it("adds an event that arrives while the page is open", async () => {
    // The whole point of the section: a collection lands and the list changes
    // without anybody reloading.
    mockPolls({
      events: [session("b", "GERERÊ", "2026-07-28T23:00:00Z")],
      cursor: "2026-07-28T23:00:00Z",
    });
    render(
      <ActivityFeed
        initialEvents={[session("a", "douglasccosta", "2026-07-28T22:00:00Z")]}
        limit={8}
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(ACTIVITY_POLL_MS);
    });

    await waitFor(() => expect(screen.getAllByRole("link")).toHaveLength(2));
    // Newest first.
    expect(screen.getAllByRole("link")[0]).toHaveTextContent("GERERÊ");
  });

  it("sends the newest instant it holds as the cursor", async () => {
    const fetchMock = mockPolls();
    render(
      <ActivityFeed initialEvents={[session("a", "Ana", "2026-07-28T22:00:00.000Z")]} limit={8} />,
    );

    await act(async () => {
      vi.advanceTimersByTime(ACTIVITY_POLL_MS);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/activity?since=${encodeURIComponent("2026-07-28T22:00:00.000Z")}`,
      { cache: "no-store" },
    );
  });

  it("does not poll while the tab is hidden", async () => {
    // A page left open overnight must not spend the night making requests.
    const fetchMock = mockPolls();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    render(<ActivityFeed initialEvents={[]} limit={8} />);

    await act(async () => {
      vi.advanceTimersByTime(ACTIVITY_POLL_MS * 3);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the list on screen when a poll fails", async () => {
    // The rows are still true, just not the newest. An error state here would be
    // louder than the problem.
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ActivityFeed initialEvents={[session("a", "Ana", "2026-07-28T22:00:00Z")]} limit={8} />,
    );

    await act(async () => {
      vi.advanceTimersByTime(ACTIVITY_POLL_MS);
    });

    expect(screen.getByRole("link")).toHaveTextContent("Ana");
  });
});
