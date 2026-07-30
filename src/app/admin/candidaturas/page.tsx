import type { Metadata } from "next";
import Link from "next/link";

import { RecruitsList } from "@/features/admin/components/recruits-list";
import { getRecruits } from "@/features/admin/lib/recruit-queries";

export const metadata: Metadata = { title: "Candidaturas" };

export const dynamic = "force-dynamic";

export default async function AdminRecruitsPage() {
  const recruits = await getRecruits();
  const pending = recruits.filter((recruit) => recruit.status === "pending").length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <header className="shrink-0 space-y-1">
        <h1 className="font-heading text-2xl font-bold">Candidaturas</h1>
        <p className="text-muted-foreground text-sm">
          {pending === 0
            ? "Nenhuma aguardando."
            : `${pending} aguardando resposta de ${recruits.length} no total.`}{" "}
          Aprovar cria o membro com o nome da EA que a própria pessoa informou, resolve a identidade
          e deixa o convite pronto para ser gerado na aba Membros. O formulário público está em{" "}
          <Link href="/candidatar" className="text-primary underline">
            /candidatar
          </Link>
          .
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <RecruitsList recruits={recruits} />
      </div>
    </div>
  );
}
