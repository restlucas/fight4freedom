# tests — End-to-end (Playwright)

E2E specs live in `tests/e2e/`. Unit tests are colocated next to source files under `src/`,
not here.

## Conventions

- One spec per user-facing flow. Name files `*.spec.ts`.
- Prefer role-based queries (`getByRole`, `getByLabel`) over CSS selectors.
- `baseURL` is `http://localhost:3000`; use relative paths (`page.goto("/")`).
- Playwright starts the dev server automatically (see `playwright.config.ts`).
- Run with `pnpm test:e2e`.
