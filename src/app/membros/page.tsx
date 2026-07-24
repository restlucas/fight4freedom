import type { Metadata } from "next";

import { MembersList } from "@/features/clan/components/members-list";
import { getMembersOverview } from "@/features/clan/lib/queries";

export const metadata: Metadata = {
  title: "Membros",
  description: "Os membros do clã Fight4Freedom de Battlefield 6.",
};

// DB-backed vitrine: render at request time so it always reflects current data
// (and so the build doesn't need a database connection).
export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const members = await getMembersOverview();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <header className="mb-8 space-y-1">
        <h1 className="text-3xl font-bold">Membros</h1>
        <p className="text-muted-foreground">
          {members.length} {members.length === 1 ? "soldado" : "soldados"} no
          esquadrão.
        </p>
      </header>

      {members.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-10 text-center">
          Nenhum membro cadastrado ainda.
        </p>
      ) : (
        <MembersList members={members} />
      )}
    </main>
  );
}
