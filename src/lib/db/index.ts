// Prisma client singleton. Server-only — never import from a Client Component.
// Prisma 7 requires a driver adapter; we use @prisma/adapter-pg against the
// Supabase transaction pooler (pgbouncer). Reuse one instance across HMR
// reloads in dev to avoid exhausting connections.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { serverEnv } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createClient(): PrismaClient {
  // Read through serverEnv so a missing DATABASE_URL fails with the variable's
  // name. Passing process.env.DATABASE_URL straight in let `undefined` through,
  // and pg then silently tried localhost — which in production surfaced as an
  // opaque "error in the Server Components render" instead of a config problem.
  const adapter = new PrismaPg({ connectionString: serverEnv.databaseUrl });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

// Re-export model & enum types for convenience: import from "@/lib/db".
export type {
  Member,
  Medal,
  MemberMedal,
  StatSnapshot,
  Highlight,
  Profile,
  Platform,
  MemberRole,
  MedalTier,
  StatSource,
} from "@prisma/client";
