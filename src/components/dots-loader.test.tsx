import { describe, expect, it } from "vitest";

import { render, screen } from "@/test-utils";

import { DotsLoader } from "./dots-loader";

describe("DotsLoader", () => {
  it("announces itself as a status with a default label", () => {
    render(<DotsLoader />);
    expect(screen.getByRole("status", { name: "Carregando" })).toBeInTheDocument();
  });

  it("renders three dots staggered by a third of the cycle", () => {
    render(<DotsLoader label="Buscando" />);
    const dots = Array.from(
      screen.getByRole("status", { name: "Buscando" }).children,
    ) as HTMLElement[];

    expect(dots).toHaveLength(3);
    expect(dots.map((dot) => dot.style.animationDelay)).toEqual(["0s", "0.3s", "0.6s"]);
  });

  it("scales the dots with the size variant", () => {
    render(<DotsLoader size="sm" />);
    const [dot] = Array.from(screen.getByRole("status").children) as HTMLElement[];
    expect(dot).toHaveClass("size-1.5");
  });
});
