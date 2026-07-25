import type { Metadata } from "next";

import { MedalsManager } from "@/features/admin/components/medals-manager";
import { getAdminMedals } from "@/features/admin/lib/queries";
import { serverEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Medalhas" };

export const dynamic = "force-dynamic";

export default async function AdminMedalsPage() {
  const medals = await getAdminMedals();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
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
