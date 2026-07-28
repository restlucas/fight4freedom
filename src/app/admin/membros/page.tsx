import type { Metadata } from "next";

import { MembersTable } from "@/features/admin/components/members-table";
import { getAdminMedals, getAdminMembers } from "@/features/admin/lib/queries";

export const metadata: Metadata = { title: "Membros" };

export const dynamic = "force-dynamic";

export default async function AdminMembersPage() {
  // The catalog comes along so the medal dialog opens with everything it needs.
  const [members, medals] = await Promise.all([getAdminMembers(), getAdminMedals()]);

  return (
    // Fills the shell so the table can own the leftover height (see table-styles.ts).
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <header className="shrink-0 space-y-1">
        <h1 className="font-heading text-2xl font-bold">Membros</h1>
        <p className="text-muted-foreground text-sm">
          {members.length} cadastrados. O convite é o que vincula a conta do Discord e o único jeito
          de criar um novo administrador.
        </p>
      </header>

      <MembersTable members={members} medals={medals} />
    </div>
  );
}
