import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { render, screen } from "@/test-utils";

import type { ProgressionPoint } from "../lib/progression";
import { MemberProgression } from "./member-progression";

/**
 * Recharts measures its container, and jsdom reports every element as 0x0, so the
 * plotted SVG never materialises here. What IS worth locking is the part that has
 * behaviour: the metric toggle, its pressed state and the accessible names — the
 * chart itself is checked by looking at the running app.
 */
const series: ProgressionPoint[] = [
  {
    capturedAt: "2026-07-27T22:40:00.000Z",
    points: 0,
    kd: 2.5,
    kills: 100,
    matches: 20,
    hours: 10,
  },
  {
    capturedAt: "2026-07-28T01:10:00.000Z",
    points: 320,
    kd: 2.6,
    kills: 140,
    matches: 24,
    hours: 12,
  },
];

describe("MemberProgression", () => {
  it("offers one metric per toggle, with points selected first", () => {
    render(<MemberProgression series={series} />);

    for (const label of ["Pontos", "Kills", "K/D", "Partidas"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    // Points leads because it is the metric the rank ladder is made of.
    expect(screen.getByRole("button", { name: "Pontos" })).toHaveAttribute("aria-pressed", "true");
  });

  it("moves the pressed state when another metric is chosen", async () => {
    const user = userEvent.setup();
    render(<MemberProgression series={series} />);

    await user.click(screen.getByRole("button", { name: "K/D" }));

    expect(screen.getByRole("button", { name: "K/D" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Pontos" })).toHaveAttribute("aria-pressed", "false");
  });

  it("never marks two metrics as selected at once", async () => {
    const user = userEvent.setup();
    render(<MemberProgression series={series} />);

    await user.click(screen.getByRole("button", { name: "Partidas" }));

    const pressed = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
  });
});
