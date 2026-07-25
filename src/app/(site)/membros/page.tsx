import type { Metadata } from "next";
import Image from "next/image";

import { MembersList } from "@/features/clan/components/members-list";
import { getMembersOverview } from "@/features/clan/lib/queries";
import { findStatLeaders } from "@/features/clan/lib/stat-keys";

export const metadata: Metadata = {
  title: "Membros",
  description: "Os membros do clã Fight4Freedom de Battlefield 6.",
};

// DB-backed vitrine: render at request time so it always reflects current data
// (and so the build doesn't need a database connection).
export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const members = await getMembersOverview();
  // Derived from the same list on screen — nothing about leaders is persisted.
  const leaders = findStatLeaders(members);

  return (
    <>
      {/* Fixed page background: stays put while the listing scrolls. */}
      {/* w-screen, not inset-0: 100vw includes the scrollbar, so this background
          keeps its size when a dialog locks body scroll and the bar disappears. */}
      <div aria-hidden className="fixed inset-y-0 left-0 -z-10 w-screen">
        <Image
          src="/background.avif"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        {/* Shadow overlay: flat scrim plus a fade into the page background, so
            the translucent cards and filters keep their contrast. */}
        <div className="bg-background/75 absolute inset-0" />
        <div className="from-background/50 via-background/20 to-background absolute inset-0 bg-gradient-to-b" />
      </div>

      <main className="mx-auto w-full max-w-6xl px-4 py-10">
        <header className="mb-8 space-y-1">
          <h1 className="text-3xl font-bold drop-shadow-sm">Membros</h1>
          <p className="text-muted-foreground">
            {members.length} {members.length === 1 ? "soldado" : "soldados"} no
            esquadrão.
          </p>
        </header>

        {members.length === 0 ? (
          <p className="text-muted-foreground bg-card/60 rounded-lg border border-dashed p-10 text-center backdrop-blur-sm">
            Nenhum membro cadastrado ainda.
          </p>
        ) : (
          <MembersList members={members} leaders={leaders} />
        )}
      </main>
    </>
  );
}
