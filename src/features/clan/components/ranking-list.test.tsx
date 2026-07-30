import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { act, render, screen } from "@/test-utils";

import type { RankingEntry } from "../lib/queries";
import { RANKING_PAGE_SIZE } from "../lib/ranking";
import { RankingList } from "./ranking-list";

function entry(rank: number, nickname: string): RankingEntry {
  return {
    rank,
    memberId: `m${rank}`,
    nickname,
    avatarUrl: null,
    platform: "ea",
    points: 1000 - rank,
    previousRank: null,
    progress: { kills: 10, matches: 5, kd: 1.2, timePlayedMinutes: 60 },
  };
}

function board(size: number): RankingEntry[] {
  return Array.from({ length: size }, (_, i) => entry(i + 1, `Membro${i + 1}`));
}

// The global stub in vitest.setup.ts does nothing, so the sentinel never fires.
// This one hands the callback back to the test, which is how the reveal is driven.
const observers: IntersectionObserverCallback[] = [];
const originalObserver = globalThis.IntersectionObserver;

beforeEach(() => {
  observers.length = 0;
  globalThis.IntersectionObserver = class {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds: readonly number[] = [];
    constructor(callback: IntersectionObserverCallback) {
      observers.push(callback);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  globalThis.IntersectionObserver = originalObserver;
});

/** Fires the most recent sentinel callback, as scrolling it into view would. */
function scrollToSentinel() {
  const callback = observers.at(-1);
  if (!callback) throw new Error("no IntersectionObserver was registered");
  act(() => {
    callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
  });
}

function shownNicknames(): string[] {
  return screen.getAllByRole("link").map((link) => link.textContent ?? "");
}

describe("RankingList", () => {
  it("reveals the first page and counts it against the whole board", () => {
    render(<RankingList board={board(40)} topPoints={1000} />);

    expect(screen.getByRole("status")).toHaveTextContent(`${RANKING_PAGE_SIZE} de 40`);
    expect(screen.getByText("Membro15")).toBeInTheDocument();
    expect(screen.queryByText("Membro16")).not.toBeInTheDocument();
  });

  it("reveals the next rows without repeating anyone at the page boundary", () => {
    // The regression this list exists to prevent: rows 15 and 16 used to come from
    // two different fetches of a board that moves between them, so a member who
    // slipped one place appeared in both.
    render(<RankingList board={board(40)} topPoints={1000} />);
    scrollToSentinel();

    expect(screen.getByRole("status")).toHaveTextContent("30 de 40");
    expect(screen.getByText("Membro16")).toBeInTheDocument();

    const shown = shownNicknames();
    expect(shown).toHaveLength(30);
    expect(new Set(shown).size).toBe(shown.length);
  });

  it("skips nobody while revealing the whole board", () => {
    render(<RankingList board={board(40)} topPoints={1000} />);
    scrollToSentinel();
    scrollToSentinel();

    expect(screen.getByRole("status")).toHaveTextContent("40 de 40");
    expect(new Set(shownNicknames()).size).toBe(40);
    for (let i = 1; i <= 40; i++) {
      expect(screen.getByText(`Membro${i}`)).toBeInTheDocument();
    }
  });

  it("filters as the visitor types and keeps each member's rank", async () => {
    const user = userEvent.setup();
    render(<RankingList board={board(40)} topPoints={1000} />);

    await user.type(screen.getByRole("searchbox", { name: /buscar membro/i }), "membro23");

    expect(screen.getByRole("status")).toHaveTextContent("1 de 1");
    expect(screen.getByText("Membro23")).toBeInTheDocument();
    // The rank badge still says 23: a search narrows the board, it never renumbers it.
    expect(screen.getByText("23")).toBeInTheDocument();
  });

  it("restarts the reveal when the search changes", async () => {
    const user = userEvent.setup();
    render(<RankingList board={board(40)} topPoints={1000} />);
    scrollToSentinel();
    expect(screen.getByRole("status")).toHaveTextContent("30 de 40");

    const search = screen.getByRole("searchbox", { name: /buscar membro/i });
    await user.type(search, "membro");

    expect(screen.getByRole("status")).toHaveTextContent(`${RANKING_PAGE_SIZE} de 40`);
  });

  it("says so when the search matches nobody", async () => {
    const user = userEvent.setup();
    render(<RankingList board={board(40)} topPoints={1000} />);

    await user.type(screen.getByRole("searchbox", { name: /buscar membro/i }), "ninguem");

    expect(screen.getByText("Nenhum membro encontrado.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("0 de 0");
  });

  it("drops the top-squad divider while searching", async () => {
    const user = userEvent.setup();
    render(<RankingList board={board(40)} topPoints={1000} />);
    expect(screen.getByRole("separator")).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: /buscar membro/i }), "membro");
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });
});
