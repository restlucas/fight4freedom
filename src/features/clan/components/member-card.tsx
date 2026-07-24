import { Medal } from "lucide-react";
import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { computeKd, totalMatches } from "@/lib/stats/snapshots";

import {
  formatHours,
  formatKd,
  formatNumber,
  PLATFORM_LABEL,
} from "../lib/format";
import type { MemberOverview } from "../lib/queries";

interface MemberCardProps {
  member: MemberOverview;
  className?: string;
}

export function MemberCard({ member, className }: MemberCardProps) {
  const { totals } = member;
  const stats = [
    { label: "K/D", value: formatKd(computeKd(totals.kills, totals.deaths)) },
    { label: "Kills", value: formatNumber(totals.kills) },
    { label: "Partidas", value: formatNumber(totalMatches(totals)) },
    { label: "Horas", value: formatHours(totals.timePlayedMinutes) },
  ];

  return (
    <Link
      href={`/membros/${member.id}`}
      className="focus-visible:ring-ring group block rounded-xl focus-visible:ring-2 focus-visible:outline-none"
    >
      <Card
        className={cn(
          "group-hover:border-primary/60 h-full gap-4 transition-colors",
          className,
        )}
      >
        <CardHeader className="flex flex-row items-center gap-3">
          <Avatar className="size-12">
            <AvatarImage
              src={member.avatarUrl ?? "/member-default.png"}
              alt={member.nickname}
            />
            <AvatarFallback className="font-heading">
              {initials(member.nickname)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-heading truncate text-lg leading-none font-semibold">
              {member.nickname}
            </p>
            <Badge variant="secondary">{PLATFORM_LABEL[member.platform]}</Badge>
          </div>
          <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Medal className="size-3.5" />
            {member.medalCount}
          </span>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-2 text-center">
            {stats.map((s) => (
              <div key={s.label}>
                <p className="font-mono text-base font-semibold tabular-nums">
                  {s.value}
                </p>
                <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function initials(nickname: string): string {
  return (
    nickname
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}
