import { Award, KeyRound, Medal, ShieldCheck, UserCheck, Users, UserX } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAdminOverview } from "@/features/admin/lib/queries";
import { formatNumber } from "@/features/clan/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const overview = await getAdminOverview();

  const tiles = [
    {
      icon: Users,
      label: "Membros",
      value: overview.members,
      hint: `${overview.inactiveMembers} inativos`,
    },
    {
      icon: UserCheck,
      label: "Contas vinculadas",
      value: overview.linkedAccounts,
      hint: "logam com Discord",
    },
    {
      icon: ShieldCheck,
      label: "Administradores",
      value: overview.admins,
      hint: "acesso ao painel",
    },
    {
      icon: KeyRound,
      label: "Convites pendentes",
      value: overview.pendingInvites,
      hint: "ainda válidos",
    },
    { icon: Medal, label: "Medalhas", value: overview.medals, hint: "no catálogo" },
    { icon: Award, label: "Concessões", value: overview.awards, hint: "medalhas entregues" },
    {
      icon: UserX,
      label: "Sem conta",
      value: overview.members - overview.linkedAccounts,
      hint: "precisam de convite",
    },
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-bold">Visão geral</h1>
        <p className="text-muted-foreground text-sm">Estado atual do clã e do acesso ao painel.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(({ icon: Icon, label, value, hint }) => (
          <Card key={label} className="gap-2 p-5">
            <div className="text-muted-foreground flex items-center gap-2 text-xs tracking-wide uppercase">
              <Icon className="size-4" />
              {label}
            </div>
            <p className="font-heading text-3xl font-bold tabular-nums">{formatNumber(value)}</p>
            <p className="text-muted-foreground text-xs">{hint}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/admin/membros">Gerenciar membros</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/membros">Ver a vitrine</Link>
        </Button>
      </div>
    </div>
  );
}
