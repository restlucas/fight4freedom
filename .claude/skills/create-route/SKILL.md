---
name: create-route
description: Scaffold a new Next.js App Router route (page) with a colocated unit test, following this project's conventions. Use when the user wants to add a new page or route.
---

# Create an App Router route

## Steps

1. Create the folder under `src/app/` matching the URL segment, e.g. `src/app/dashboard/`.
2. Add `page.tsx`. Keep it a Server Component unless it needs interactivity:
   ```tsx
   import type { Metadata } from "next";

   export const metadata: Metadata = {
     title: "Dashboard",
   };

   export default function DashboardPage() {
     return (
       <main className="flex min-h-screen flex-col items-center justify-center gap-2">
         <h1 className="text-2xl font-semibold">Dashboard</h1>
       </main>
     );
   }
   ```
3. Add a colocated test `page.test.tsx`:
   ```tsx
   import { render, screen } from "@testing-library/react";
   import { describe, expect, it } from "vitest";
   import DashboardPage from "./page";

   describe("DashboardPage", () => {
     it("renders the heading", () => {
       render(<DashboardPage />);
       expect(screen.getByRole("heading", { name: /dashboard/i })).toBeInTheDocument();
     });
   });
   ```
4. Add `loading.tsx` / `error.tsx` inside the segment only if it needs its own boundaries;
   otherwise the root ones apply.
5. Run `pnpm test` and `pnpm type-check`.

## Notes

- Add `"use client"` only when the page uses state, effects or event handlers.
- Set `metadata` (or `generateMetadata`) for SEO. `metadataBase` is inherited from the root layout.
