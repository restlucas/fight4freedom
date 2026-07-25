import type { Metadata } from "next";

import { MedalsManager } from "@/features/admin/components/medals-manager";
import { getAdminMedals } from "@/features/admin/lib/queries";
import { serverEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Medalhas" };

export const dynamic = "force-dynamic";

export default async function AdminMedalsPage() {
  const medals = await getAdminMedals();

  return (
    // Fills the shell so the table can own the leftover height (see table-styles.ts).
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <header className="shrink-0 space-y-1">
        <h1 className="font-heading text-2xl font-bold">Medalhas</h1>
        <p className="text-muted-foreground text-sm">
          {medals.length} no catálogo. A arte enviada substitui o ícone padrão.
        </p>
      </header>

      <MedalsManager
        medals={medals}
        storageEnabled={serverEnv.storageConfigured}
      />
    </div>
  );
}
