import { Medal } from "lucide-react";
import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import {
  formatKd,
  formatNumber,
  formatPercent,
  PLATFORM_LABEL,
  ROLE_LABEL,
} from "../lib/format";
import type { MemberOverview } from "../lib/queries";

interface MemberCardProps {
  member: MemberOverview;
  className?: string;
}

export function MemberCard({ member, className }: MemberCardProps) {
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
            {member.avatarUrl ? (
              <AvatarImage src={member.avatarUrl} alt={member.nickname} />
            ) : null}
            <AvatarFallback className="font-heading">
              {initials(member.nickname)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1">
            <p className="font-heading truncate text-lg leading-none font-semibold">
              {member.nickname}
            </p>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{ROLE_LABEL[member.role]}</Badge>
              <span className="text-muted-foreground text-xs">
                {PLATFORM_LABEL[member.platform]}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="K/D" value={formatKd(member.kd)} />
            <Stat label="Vitórias" value={formatPercent(member.winRate)} />
            <Stat label="Partidas" value={formatNumber(member.totals.matchesPlayed)} />
          </div>
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Medal className="size-3.5" />
            {member.medalCount} {member.medalCount === 1 ? "medalha" : "medalhas"}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-base font-semibold tabular-nums">{value}</p>
      <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
        {label}
      </p>
    </div>
  );
}
