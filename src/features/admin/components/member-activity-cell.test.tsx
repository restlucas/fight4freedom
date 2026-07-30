import { describe, expect, it } from "vitest";

import { render, screen } from "@/test-utils";

import type { MemberActivity } from "../lib/queries";
import { MemberActivityCell } from "./member-activity-cell";

function activity(overrides: Partial<MemberActivity> = {}): MemberActivity {
  return { state: "playing", lastPlayedAt: "2026-07-29T12:00:00.000Z", daysSince: 0, ...overrides };
}

describe("MemberActivityCell", () => {
  it("shows only the date for a member who is playing, with no badge", () => {
    // Most of the roster is playing, so a green badge on nearly every row is a pattern
    // the eye stops reading — and the amber and red ones lose the contrast that makes
    // them worth having.
    render(<MemberActivityCell activity={activity()} />);

    expect(screen.getByText(/^Jogou /)).toBeInTheDocument();
    expect(screen.queryByText("Jogando")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("names the threshold on the badge, not just a colour", () => {
    render(<MemberActivityCell activity={activity({ state: "at_risk", daysSince: 9 })} />);
    expect(screen.getByText("7+ dias sem jogar")).toBeInTheDocument();

    render(<MemberActivityCell activity={activity({ state: "absent", daysSince: 21 })} />);
    expect(screen.getByText("14+ dias sem jogar")).toBeInTheDocument();
  });

  it("explains that `unknown` is our problem, not the member's", () => {
    // The distinction the whole column exists for: an admin must not chase somebody
    // who is waiting on a record fix.
    render(
      <MemberActivityCell
        activity={activity({ state: "unknown", lastPlayedAt: null, daysSince: null })}
      />,
    );

    expect(screen.getByRole("button", { name: /o que significa/i })).toBeInTheDocument();
    expect(screen.getByText("Não sabemos")).toBeInTheDocument();
  });

  it("dates the last session, because a bucket is not a decision", () => {
    render(<MemberActivityCell activity={activity({ state: "absent", daysSince: 21 })} />);
    expect(screen.getByText(/^Jogou /)).toBeInTheDocument();
  });

  it("shows no date for a state with nothing to date", () => {
    render(
      <MemberActivityCell
        activity={activity({ state: "never_seen", lastPlayedAt: null, daysSince: null })}
      />,
    );

    expect(screen.getByText("Nunca vimos jogar")).toBeInTheDocument();
    expect(screen.queryByText(/^Jogou /)).not.toBeInTheDocument();
  });
});
