import type { Metadata } from "next";

import { MedalsCatalog } from "@/features/clan/components/medals-catalog";
import { getMedalsCatalog } from "@/features/clan/lib/queries";

export const metadata: Metadata = {
  title: "Medalhas",
  description:
    "Catálogo de medalhas do clã Fight4Freedom: como conquistar cada uma e quem já conquistou.",
};

// DB-backed vitrine: render at request time so it always reflects current data
// (and so the build doesn't need a database connection).
export const dynamic = "force-dynamic";

export default async function MedalhasPage() {
  const medals = await getMedalsCatalog();
  const awarded = medals.reduce((sum, medal) => sum + medal.holders.length, 0);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <header className="mb-8 space-y-1">
        <h1 className="font-heading text-3xl font-bold">Medalhas</h1>
        <p className="text-muted-foreground">
          {medals.length} {medals.length === 1 ? "medalha" : "medalhas"} no quadro · {awarded}{" "}
          {awarded === 1 ? "conquista" : "conquistas"} pelo esquadrão.
        </p>
      </header>

      {medals.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-10 text-center">
          Nenhuma medalha cadastrada ainda.
        </p>
      ) : (
        <MedalsCatalog medals={medals} />
      )}
    </main>
  );
}
