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
  /**
   * Supabase project URL and anon key. Both are public by design: the anon key
   * only grants what Row Level Security allows, and all our privileged access
   * goes through Prisma on the server. The Discord client secret lives in the
   * Supabase dashboard, never here.
   */
  get supabaseUrl(): string {
    return required(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    );
  },
  get supabaseAnonKey(): string {
    return required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  },
  /**
   * Whether auth can run at all. The public vitrine must not break when the keys
   * are absent (a CI build has no secrets), so callers check this instead of
   * letting the getters above throw.
   */
  get supabaseConfigured(): boolean {
    return Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  },
} as const;

/** Server-only vars. Access on the server; never import into Client Components. */
export const serverEnv = {
  get databaseUrl(): string {
    return required("DATABASE_URL", process.env.DATABASE_URL);
  },
  /**
   * Bypasses every RLS policy, so it is the most dangerous value in the project.
   * Only ever read inside "use server" code (see src/lib/supabase/admin.ts).
   */
  get supabaseServiceRoleKey(): string {
    return required(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
  },
  /** Whether medal artwork can be uploaded. The panel degrades without it. */
  get storageConfigured(): boolean {
    return Boolean(
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
        process.env.NEXT_PUBLIC_SUPABASE_URL,
    );
  },
} as const;
