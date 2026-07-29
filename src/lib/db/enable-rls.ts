// Turns on Row Level Security for every table in the public schema. Run with:
//
//   pnpm db:enable-rls          # reports and applies
//   pnpm db:enable-rls --check  # reports only, exits non-zero if any table is open
//
// WHY THIS IS NOT OPTIONAL. Supabase exposes the whole `public` schema through
// PostgREST, authorised by the anon key — which ships in the browser bundle and is
// PUBLIC BY DESIGN. What makes that safe is RLS, and Prisma creates tables without
// it. Measured against production on 2026-07-29, before this ran: the anon key
// could read every member's `platform_id`, `ea_persona_id` and `discord_id`, read
// invite token hashes, and WRITE — a `PATCH /rest/v1/profile` setting
// `is_admin: true` would have handed the admin panel to any visitor.
//
// NO POLICIES ARE CREATED, and that is the point. Nothing in this app reaches a
// table with the anon key: it is used only for `supabase.auth.*` (see
// src/lib/supabase/server.ts), and every query goes through Prisma. Prisma
// connects as the tables' owner, and owners bypass RLS, so switching it on closes
// PostgREST without touching the app. A policy would only be needed if the browser
// ever had to read a table directly — Supabase Realtime being the likely first
// case (docs/plano.md > Backlog).
//
// CHAINED INTO `db:push` on purpose. A new model would otherwise arrive with RLS
// off and reopen the hole silently, which is exactly how it happened the first
// time.

import { db } from "./index";

const CHECK_ONLY = process.argv.includes("--check");

type TableRow = { tablename: string; rowsecurity: boolean };

async function main() {
  try {
    // Through the same client every other script uses. `ALTER TABLE ... ENABLE ROW
    // LEVEL SECURITY` is a single statement, so the transaction pooler handles it
    // fine — unlike `db push`, which needs the session pooler for its advisory
    // locks.
    const rows = await db.$queryRaw<TableRow[]>`
      select tablename, rowsecurity
        from pg_tables
       where schemaname = 'public'
       order by tablename
    `;

    const open = rows.filter((row) => !row.rowsecurity);

    console.log(`\ntabelas no schema public: ${rows.length}`);
    for (const row of rows) {
      console.log(`  ${row.rowsecurity ? "[RLS]" : "[ABERTA]"} ${row.tablename}`);
    }

    if (open.length === 0) {
      console.log("\nTodas com RLS habilitado.\n");
      return;
    }

    if (CHECK_ONLY) {
      console.error(
        `\n>> ${open.length} tabela(s) SEM RLS: ${open.map((r) => r.tablename).join(", ")}\n` +
          "   Rode `pnpm db:enable-rls` para fechar.\n",
      );
      process.exitCode = 1;
      return;
    }

    for (const row of open) {
      // Identifier interpolated from pg_tables, not from user input, and quoted.
      // `$executeRawUnsafe` because an identifier cannot be a bound parameter.
      await db.$executeRawUnsafe(`alter table public."${row.tablename}" enable row level security`);
      console.log(`  habilitado: ${row.tablename}`);
    }
    console.log(`\nOK: RLS habilitado em ${open.length} tabela(s).\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
