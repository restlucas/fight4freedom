# src/lib — Utilities

Framework-agnostic helpers. No React components here.

## Conventions

- Keep functions pure and side-effect free so they are trivial to unit test.
- `cn(...)` merges Tailwind classes (clsx + tailwind-merge). Use it for all conditional
  className logic.
- One concern per file; export named functions.
- Add a colocated `*.test.ts` for any non-trivial logic.
