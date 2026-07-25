import type { Metadata } from "next";

import { MembersTable } from "@/features/admin/components/members-table";
import { getAdminMembers } from "@/features/admin/lib/queries";

export const metadata: Metadata = { title: "Membros" };

export const dynamic = "force-dynamic";

export default async function AdminMembersPage() {
  const members = await getAdminMembers();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-bold">Membros</h1>
        <p className="text-muted-foreground text-sm">
          {members.length} cadastrados. O convite é o que vincula a conta do
          Discord e o único jeito de criar um novo administrador.
        </p>
      </header>

      <MembersTable members={members} />
    </div>
  );
}
