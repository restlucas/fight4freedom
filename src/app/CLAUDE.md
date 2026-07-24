# src/app — App Router

Routes, layout and global styles live here.

## Conventions

- Server Components by default. Add `"use client"` at the top only for interactivity, state,
  effects or browser APIs.
- File conventions: `page.tsx` (route UI), `layout.tsx` (shared shell), `loading.tsx` (suspense
  fallback), `error.tsx` (error boundary, must be a Client Component), `not-found.tsx` (404).
  Baseline versions of these already exist at the root of this folder.
- `loading.tsx` must render a **skeleton that mirrors the populated page's layout and proportions**
  (same sections, sizes, grid), built from the shadcn `Skeleton` primitive — not a generic spinner.
- Export `metadata` (or `generateMetadata`) from `page.tsx`/`layout.tsx` for SEO. `metadataBase`
  is set in `layout.tsx` from `NEXT_PUBLIC_APP_URL`.
- Keep pages thin: fetch data and compose components. Put generic reusable UI in
  `src/components/`; domain code goes in `src/features/<name>/` (see the Features section in
  the root `CLAUDE.md`). Routes never move into features — `page.tsx` stays here and imports
  from them.
- Colocate unit tests: `page.tsx` -> `page.test.tsx`.

To scaffold a route, use the `create-route` skill.
