import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { render, screen } from "@/test-utils";

import { useNow } from "./use-now";

function Probe() {
  const now = useNow();
  return <span data-testid="now">{now === null ? "sem relógio" : String(now)}</span>;
}

describe("useNow", () => {
  it("has no clock on the server", () => {
    // The whole reason the hook can return null. `Date.now()` on the server is
    // not the `Date.now()` of the hydrating browser, so a hook that returned a
    // real timestamp here would hand every caller a hydration mismatch.
    expect(renderToString(<Probe />)).toContain("sem relógio");
  });

  it("has a clock once mounted in the browser", () => {
    render(<Probe />);
    expect(Number(screen.getByTestId("now").textContent)).toBeGreaterThan(0);
  });
});
