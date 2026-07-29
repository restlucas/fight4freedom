import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { RefreshOnFocus } from "./refresh-on-focus";

/** Drives the two events the component listens to. */
function returnToTab(state: DocumentVisibilityState = "visible") {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("RefreshOnFocus", () => {
  it("refreshes when the visitor comes back after the window", () => {
    render(<RefreshOnFocus />);

    vi.advanceTimersByTime(31_000);
    returnToTab();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does nothing on a quick alt-tab, which would be a poll with extra steps", () => {
    render(<RefreshOnFocus />);

    // Three switches inside the window.
    for (let i = 0; i < 3; i += 1) {
      vi.advanceTimersByTime(2_000);
      returnToTab();
    }

    expect(refresh).not.toHaveBeenCalled();
  });

  it("does nothing when the event fires while the tab is still hidden", () => {
    render(<RefreshOnFocus />);

    vi.advanceTimersByTime(31_000);
    returnToTab("hidden");

    expect(refresh).not.toHaveBeenCalled();
  });

  it("also answers window focus, where visibilitychange never fires", () => {
    // Switching between two windows keeps the tab "visible", so a component
    // listening only to visibilitychange would never refresh.
    render(<RefreshOnFocus />);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");

    vi.advanceTimersByTime(31_000);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh on mount: the page was just rendered on the server", () => {
    render(<RefreshOnFocus />);

    expect(refresh).not.toHaveBeenCalled();
  });

  it("waits the full window again after refreshing", () => {
    render(<RefreshOnFocus minIntervalMs={10_000} />);

    vi.advanceTimersByTime(11_000);
    returnToTab();
    expect(refresh).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5_000);
    returnToTab();
    expect(refresh).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(6_000);
    returnToTab();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("stops listening when unmounted", () => {
    const { unmount } = render(<RefreshOnFocus />);
    vi.advanceTimersByTime(31_000);
    unmount();

    returnToTab();

    expect(refresh).not.toHaveBeenCalled();
  });
});
