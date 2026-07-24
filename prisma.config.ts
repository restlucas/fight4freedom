import { defineConfig } from "prisma/config";

// Env is injected by dotenv-cli in the db:* scripts (see package.json). We read
// process.env directly (not the throwing env() helper) so that `prisma generate`
// — run by postinstall without env loaded — never fails. CLI commands that
// actually connect (db push, studio) use the direct/session connection (port
// 5432) via dotenv-cli, never the pgbouncer pooler.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx src/lib/db/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? "",
  },
});
