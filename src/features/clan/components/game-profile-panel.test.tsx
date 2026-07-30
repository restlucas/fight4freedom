import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ProfileTopItem } from "../lib/queries";
import { GameProfilePanel } from "./game-profile-panel";

const game = {
  rankName: "Second Lieutenant V",
  rankLevel: 141,
  rankImageUrl: "https://cdn.gametools.network/ranks/bf6/t_ui_rank_140_sm.png",
};

const NO_GAME = { rankName: null, rankLevel: null, rankImageUrl: null };

const weapon: ProfileTopItem = {
  kind: "weapon",
  name: "L110",
  group: "Machine Guns",
  imageUrl: "https://cdn.gametools.network/weapons/bf6/T_UI_Minimi.webp",
  kills: 3_412,
  matches: 0,
  wins: 0,
  secondsUsed: 21_500,
  accuracy: 21.91,
};

const mode: ProfileTopItem = {
  kind: "gamemode",
  name: "Escalation",
  group: null,
  // Dropped at collection time: mode artwork is SVG.
  imageUrl: null,
  kills: 969,
  matches: 37,
  wins: 16,
  secondsUsed: 52_212,
  accuracy: null,
};

const map: ProfileTopItem = {
  kind: "map",
  name: "Siege of Cairo",
  group: null,
  imageUrl: "https://cdn.gametools.network/maps/bf6/T_UI_Abbasid.webp",
  kills: 0,
  matches: 86,
  wins: 50,
  secondsUsed: 113_310,
  accuracy: null,
};

describe("GameProfilePanel rank row", () => {
  it("leads with the level and names the rank under it", () => {
    render(<GameProfilePanel game={game} topItems={[]} />);

    expect(screen.getByText("Nível 141")).toBeInTheDocument();
    expect(screen.getByText("Second Lieutenant V")).toBeInTheDocument();
  });

  it("renders the insignia the source points at, decoratively", () => {
    render(<GameProfilePanel game={game} topItems={[]} />);

    // The level beside it already carries the meaning, so an alt text here would be
    // read out twice.
    const image = document.querySelector("img");
    expect(image).toHaveAttribute("alt", "");
    expect(image?.getAttribute("src")).toContain("t_ui_rank_140_sm.png");
  });

  it("promotes the rank name when the source sent no level", () => {
    // Never a row reading "Nível null": the two fields fail independently.
    render(<GameProfilePanel game={{ ...game, rankLevel: null }} topItems={[]} />);

    expect(screen.getByText("Second Lieutenant V")).toBeInTheDocument();
    expect(screen.getByText("Patente no Battlefield 6")).toBeInTheDocument();
    expect(screen.queryByText(/Nível/)).not.toBeInTheDocument();
  });

  it("survives a rank with no artwork", () => {
    render(<GameProfilePanel game={{ ...game, rankImageUrl: null }} topItems={[]} />);

    expect(screen.getByText("Nível 141")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("GameProfilePanel top items", () => {
  it("shows one row per kind, in a fixed order", () => {
    // Fixed rather than sorted: the three answer different questions, so ranking them
    // against each other would mean nothing. Passed out of order on purpose.
    render(<GameProfilePanel game={game} topItems={[map, weapon, mode]} />);

    const labels = screen
      .getAllByText(/Melhor arma|Modo mais jogado|Mapa mais jogado/)
      .map((el) => el.textContent);
    expect(labels).toEqual(["Melhor arma", "Modo mais jogado", "Mapa mais jogado"]);
  });

  it("reports a weapon in kills and accuracy", () => {
    render(<GameProfilePanel game={NO_GAME} topItems={[weapon]} />);

    expect(screen.getByText("L110")).toBeInTheDocument();
    // Accuracy arrives as a percentage number (21.91), never a fraction, because
    // every call sends `format_values=false`.
    expect(screen.getByText("3.412 kills · 21,9% precisão")).toBeInTheDocument();
  });

  it("reports a map and a mode in hours and win rate", () => {
    render(<GameProfilePanel game={NO_GAME} topItems={[mode, map]} />);

    // A place is measured in time spent, not in kills.
    expect(screen.getByText("Escalation")).toBeInTheDocument();
    expect(screen.getByText("15 h · 43% vitórias")).toBeInTheDocument();
    expect(screen.getByText("Siege of Cairo")).toBeInTheDocument();
    expect(screen.getByText("31 h · 58% vitórias")).toBeInTheDocument();
  });

  it("omits the win rate when there are no matches to divide by", () => {
    // Never "NaN%", and never a plausible-looking 0 %.
    render(<GameProfilePanel game={NO_GAME} topItems={[{ ...map, matches: 0, wins: 0 }]} />);

    expect(screen.getByText("31 h")).toBeInTheDocument();
    expect(screen.queryByText(/vitórias/)).not.toBeInTheDocument();
  });

  it("omits accuracy the source did not report", () => {
    render(<GameProfilePanel game={NO_GAME} topItems={[{ ...weapon, accuracy: null }]} />);

    expect(screen.getByText("3.412 kills")).toBeInTheDocument();
    expect(screen.queryByText(/precisão/)).not.toBeInTheDocument();
  });

  it("falls back to an icon for a row with no artwork", () => {
    // The mode case, always: its art is SVG and the collector drops the URL rather
    // than making us enable `dangerouslyAllowSVG` for a third-party CDN.
    render(<GameProfilePanel game={NO_GAME} topItems={[mode]} />);

    expect(screen.getByText("Escalation")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("renders the items even when the game rank has not been collected", () => {
    // The two halves arrive from different calls, so one must not gate the other.
    render(<GameProfilePanel game={NO_GAME} topItems={[weapon]} />);

    expect(screen.getByText("L110")).toBeInTheDocument();
    expect(screen.queryByText(/Nível/)).not.toBeInTheDocument();
  });

  it("renders nothing at all when there is neither a rank nor an item", () => {
    // Not an empty panel: this state fills itself within hours, and a heading over a
    // blank row would read as broken.
    const { container } = render(<GameProfilePanel game={NO_GAME} topItems={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
