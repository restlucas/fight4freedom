// Single source of truth for environment variables (see CLAUDE.md).
// Only variables prefixed with NEXT_PUBLIC_ are safe in the browser; everything
// else is server-only and read lazily so importing this module never throws in a
// client bundle (where server vars are undefined).

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Public vars — inlined by Next at build time, safe to read anywhere. */
export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
} as const;

/** Server-only vars. Access on the server; never import into Client Components. */
export const serverEnv = {
  get databaseUrl(): string {
    return required("DATABASE_URL", process.env.DATABASE_URL);
  },
} as const;
