# CLAUDE.md

Reusable Next.js base for the freelance roadmap projects. Keep it lean: only what every
project needs. Project-specific dependencies (Supabase, Stripe, TanStack Query, Recharts, etc.)
are added per project, never committed to this base.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript (strict)
- Tailwind CSS v4 + shadcn/ui (base color `neutral`, style `new-york`)
- ESLint (flat config) + Prettier (with `prettier-plugin-tailwindcss`)
- Vitest + Testing Library (unit), Playwright (E2E)
- pnpm

## Commands

- `pnpm dev` — dev server
- `pnpm build` — production build
- `pnpm lint` — ESLint
- `pnpm type-check` — `tsc --noEmit`
- `pnpm test` — unit tests (Vitest)
- `pnpm test:e2e` — E2E tests (Playwright)
- `pnpm format` — format with Prettier

Run `pnpm lint`, `pnpm type-check` and `pnpm test` before committing. CI runs all of them
plus `pnpm build` and the E2E job (see `.github/workflows/ci.yml`).

## Structure

- `src/app/` — routes, layout, global styles, root `error`/`loading`/`not-found`. See `src/app/CLAUDE.md`.
- `src/components/` — shared, generic UI (`ui/` holds shadcn primitives). See `src/components/CLAUDE.md`.
- `src/lib/` — framework-agnostic utilities. See `src/lib/CLAUDE.md`.
- `src/features/<name>/` — domain modules, created on demand (see Features below).
- `tests/e2e/` — Playwright specs. See `tests/CLAUDE.md`.

## Conventions

- Use the `@/*` import alias (maps to `src/`). No deep relative paths like `../../lib`.
- Server Components by default. Add `"use client"` only when a component needs interactivity,
  state, effects or browser APIs.
- Compose Tailwind classes with `cn()` from `@/lib/utils`, never string concatenation.
- Loading states: `loading.tsx` and every Suspense fallback must be a **skeleton that mirrors
  the real component's layout and proportions** (same structure, element sizes, grid/columns) —
  never a generic spinner or a single grey box. Build them from the shadcn `Skeleton` primitive
  and keep them next to (or matching) the component they stand in for.
- Colocate unit tests next to the file under test (`foo.tsx` -> `foo.test.tsx`). Keep E2E specs
  in `tests/e2e/`.
- All code, comments and identifiers in English.
- Read env vars from a single place; expose to the browser only with the `NEXT_PUBLIC_` prefix.
  Copy `.env.example` to `.env.local`.
- **Browser storage keys are namespaced `@fight4freedom/<key>`** (localStorage and
  sessionStorage alike). Build them with `storageKey()` from `@/lib/storage` and read/write
  through that module — never hand-write the prefix or call `localStorage` directly at a call
  site. For state that must re-render, use the `usePersistedState` hook (`@/hooks`), which is
  hydration-safe.

## Features

Default layout is zero-ceremony: pages in `app/`, shared UI in `components/`, logic in `lib/`.
Escalate per domain, not upfront:

- When a single business domain (billing, auth, reports, ...) accumulates **3+ related files**
  spread across `components/`, `hooks/` or `lib/`, group them into `src/features/<name>/` with
  `components/`, `hooks/` and `lib/` subfolders as needed.
- Routes never move: `page.tsx` stays in `app/` (it defines the URL) and becomes a thin shell
  that imports from the feature. `src/features/` is outside `app/`, so it never becomes a route.
- Features do not import from other features; they may import from shared `components/` and
  `lib/`. Generic code (a `Button`, a `formatDate()`) stays shared and never moves into a feature.
- Do not create `src/features/` upfront; it appears with the first feature that earns it.

## Skills

- `add-shadcn-component` — add a shadcn/ui component the right way.
- `create-route` — scaffold a new App Router route with a colocated test.
- `create-component` — scaffold a custom component with typed props and a colocated test.
