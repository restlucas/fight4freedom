import { KeyRound, Medal, UserCheck, Users } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAdminOverview } from "@/features/admin/lib/queries";
import { ActivityFeed } from "@/features/clan/components/activity-feed";
import { formatNumber } from "@/features/clan/lib/format";
import { ACTIVITY_FEED_LIMIT, getActivityFeed } from "@/features/clan/lib/queries";

export const dynamic = "force-dynamic";

/** "1 inativo", "3 inativos". The old hint read "1 inativos". */
function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

export default async function AdminHomePage() {
  const [overview, activity] = await Promise.all([getAdminOverview(), getActivityFeed()]);

  // FOUR tiles, folded down from seven — and folded, not cut: every number that
  // had its own card still shows, as the hint of the tile it belongs to. Seven
  // cards over three columns left a dangling row of one and gave equal weight to
  // "Administradores" (a number that changes once a year) and "Membros".
  const tiles = [
    {
      icon: Users,
      label: "Membros",
      value: overview.members,
      hint: `${plural(overview.inactiveMembers, "inativo")} · ${overview.members - overview.linkedAccounts} sem conta`,
    },
    {
      icon: UserCheck,
      label: "Contas vinculadas",
      value: overview.linkedAccounts,
      hint: `logam com Discord · ${overview.admins} admin`,
    },
    {
      icon: KeyRound,
      label: "Convites pendentes",
      value: overview.pendingInvites,
      hint: "ainda válidos",
    },
    {
      icon: Medal,
      label: "Medalhas",
      value: overview.medals,
      hint: `no catálogo · ${overview.awards} concedidas`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Title and actions on one line. `flex-wrap` and not a hidden/shown pair:
          on a narrow panel the buttons drop below the text and stay reachable,
          instead of a second copy of them existing somewhere off screen. */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-bold">Visão geral</h1>
          <p className="text-muted-foreground text-sm">
            Estado atual do clã e do acesso ao painel.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/admin/membros">Gerenciar membros</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/membros">Ver a vitrine</Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      {/* Panel only, by the owner's call (2026-07-29): the feed is operational
          information, not vitrine content. On this page it doubles as the closest
          thing to a live monitor of the collection — a row appearing means the
          worker ran and credited, without opening the Railway log. */}
      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="font-heading text-lg font-semibold">Atividade recente</h2>
          <p className="text-muted-foreground text-sm">
            Sessões e promoções do clã, atualizando sozinho.
          </p>
        </div>
        <ActivityFeed initialEvents={activity} limit={ACTIVITY_FEED_LIMIT} />
      </section>
    </div>
  );
}
