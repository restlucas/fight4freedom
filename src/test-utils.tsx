// Testing Library render wrapped in the app-level providers.
//
// Components that use Radix primitives needing context (Tooltip, HoverCard)
// throw when rendered bare, because the provider lives in src/app/layout.tsx.
// Import `render` from here instead of "@testing-library/react" and they work.

import { render as rtlRender, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";

function Providers({ children }: { children: ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

export function render(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return rtlRender(ui, { wrapper: Providers, ...options });
}

// Everything else (screen, waitFor, within, ...) passes straight through.
export * from "@testing-library/react";
