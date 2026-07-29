import { describe, expect, it } from "vitest";

import { render, screen } from "@/test-utils";

import type { RankingEntry } from "../lib/queries";
import { RankingRow } from "./ranking-row";

function entry(overrides: Partial<RankingEntry> = {}): RankingEntry {
  return {
    rank: 1,
    memberId: "m1",
    nickname: "RRRRRRRREST",
    avatarUrl: null,
    platform: "ea",
    points: 1240,
    // No movement by default, so the cases that test the arrows say so.
    previousRank: null,
    progress: { kills: 40, matches: 10, kd: 1.5, timePlayedMinutes: 120 },
    ...overrides,
  };
}

function rowOf(e: RankingEntry): HTMLElement {
  render(<RankingRow entry={e} topPoints={1240} />);
  return screen.getByRole("link");
}

describe("RankingRow", () => {
  it("links to the member profile and shows their score", () => {
    const row = rowOf(entry());
    expect(row).toHaveAttribute("href", "/membros/m1");
    expect(row).toHaveTextContent("RRRRRRRREST");
    expect(row).toHaveTextContent("1.240");
  });

  it("marks the leader with a crown", () => {
    rowOf(entry());
    expect(screen.getByLabelText("Líder do mês")).toBeInTheDocument();
  });

  it("does not crown rank 1 on an unscored board", () => {
    // Everyone on zero points means nobody led anything.
    rowOf(entry({ points: 0 }));
    expect(screen.queryByLabelText("Líder do mês")).not.toBeInTheDocument();
  });
});

/**
 * These assert on resolved class names, which is normally too brittle to be
 * worth it. They exist because this exact bug shipped twice: the leader row kept
 * ending up more translucent than the plain rows below it, first from a tint that
 * replaced the card background and then from an alpha gradient over it. The rule
 * being locked is narrow — the leader's surface carries no transparency — so a
 * restyle only trips these if it reintroduces the bug.
 */
describe("leader surface stays opaque", () => {
  it("uses the card colour at full opacity, not the translucent variant", () => {
    const cls = rowOf(entry()).className;
    expect(cls).toMatch(/(^|\s)bg-card(\s|$)/);
    expect(cls).not.toMatch(/bg-card\/\d+/);
  });

  it("carries no alpha fill or gradient wash", () => {
    const cls = rowOf(entry()).className;
    // No `bg-yellow-500/20`, `bg-yellow-500/[0.08]` and friends.
    expect(cls).not.toMatch(/bg-yellow-\d+\/(\d+|\[)/);
    // No gradient: a fading overlay reads as transparency even over solid paint.
    expect(cls).not.toMatch(/bg-(gradient|linear)-to-/);
    expect(cls).not.toMatch(/\bfrom-|\bvia-|\bto-transparent\b/);
  });

  it("drops the backdrop blur it no longer needs", () => {
    const cls = rowOf(entry()).className;
    expect(cls).toContain("backdrop-blur-none");
    expect(cls).not.toMatch(/backdrop-blur-(sm|md|lg|xl)/);
  });

  it("stays opaque on hover", () => {
    // The base row lightens to `bg-card/95` on hover; the leader must not.
    const cls = rowOf(entry()).className;
    expect(cls).not.toMatch(/hover:bg-card\/\d+/);
    expect(cls).toMatch(/hover:bg-card(\s|$)/);
  });

  it("puts the gold in the border instead", () => {
    const cls = rowOf(entry()).className;
    expect(cls).toContain("border-yellow-400");
    expect(cls).toContain("border-l-4");
  });

  it("glows in gold from the inside, via an inset shadow", () => {
    // Inside, not around: the glow is anchored to the edges and fades to nothing
    // in the middle, so the centre stays the plain solid card colour. A gradient
    // background would instead lay a flat film over the whole surface, which is
    // the thing that read as see-through.
    const cls = rowOf(entry()).className;
    expect(cls).toMatch(/inset-shadow-\[/);
    // And NOT an outer coloured glow, which is where this lived before.
    expect(cls).not.toMatch(/(^|\s)shadow-yellow-\d+/);
  });

  it("leaves the other rows translucent, since only the leader is solid", () => {
    const cls = rowOf(entry({ rank: 5, memberId: "m5", points: 300 })).className;
    expect(cls).toContain("bg-card/80");
    expect(cls).toContain("backdrop-blur-md");
    expect(cls).not.toContain("border-yellow-400");
  });
});

describe("RankingRow movement", () => {
  it("shows how many places were gained", () => {
    const row = rowOf(entry({ rank: 4, previousRank: 9 }));
    expect(row).toHaveTextContent("subiu");
    expect(row).toHaveTextContent("5");
  });

  it("shows how many places were lost", () => {
    const row = rowOf(entry({ rank: 9, previousRank: 4 }));
    expect(row).toHaveTextContent("caiu");
  });

  it("stays silent when the position did not move", () => {
    const row = rowOf(entry({ rank: 4, previousRank: 4 }));
    expect(row).not.toHaveTextContent("subiu");
    expect(row).not.toHaveTextContent("caiu");
  });

  it("stays silent when there is no comparable standing", () => {
    // Null covers a zero-point member and a closed season — see RankingEntry.
    const row = rowOf(entry({ rank: 40, previousRank: null }));
    expect(row).not.toHaveTextContent("subiu");
    expect(row).not.toHaveTextContent("caiu");
  });

  it("says the direction in text, not only in colour", () => {
    // Red and green is exactly the pair colourblind readers cannot separate, so
    // the arrow and a screen-reader word carry the direction too.
    const row = rowOf(entry({ rank: 2, previousRank: 3 }));
    expect(row.querySelector(".sr-only")?.textContent).toBe("subiu");
  });
});
