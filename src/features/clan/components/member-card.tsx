import { Clock, Crosshair, Crown, Gamepad2, Swords, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { rankForPoints } from "@/lib/ranks";
import { cn } from "@/lib/utils";
import { computeKd, totalMatches } from "@/lib/stats/snapshots";

import { formatHours, formatKd, formatNumber, formatPoints, memberInitials } from "../lib/format";
import type { MemberOverview } from "../lib/queries";
import { isStatLeader, STAT_KEY_LABEL, type StatKey, type StatLeaders } from "../lib/stat-keys";
import { MedalGroup } from "./medal-group";
import { PlatformIcon } from "./platform-icon";
import { RankInsignia } from "./rank-insignia";

const STAT_ICON: Record<StatKey, LucideIcon> = {
  kd: Swords,
  kills: Crosshair,
  matches: Gamepad2,
  hours: Clock,
};

interface MemberCardProps {
  member: MemberOverview;
  /** Who leads each stat; the leader gets a crown next to the value. */
  leaders?: StatLeaders;
  className?: string;
}

export function MemberCard({ member, leaders, className }: MemberCardProps) {
  const { totals } = member;
  const stats: { key: StatKey; value: string }[] = [
    { key: "kd", value: formatKd(computeKd(totals.kills, totals.deaths)) },
    { key: "kills", value: formatNumber(totals.kills) },
    { key: "matches", value: formatNumber(totalMatches(totals)) },
    { key: "hours", value: formatHours(totals.timePlayedMinutes) },
  ];

  return (
    <Link
      href={`/membros/${member.id}`}
      className="focus-visible:ring-ring group block rounded-xl focus-visible:ring-2 focus-visible:outline-none"
    >
      {/* Translucent surface: the page background image shows through without
          costing contrast (see /membros). */}
      <Card
        className={cn(
          "bg-card/80 group-hover:border-primary/60 h-full gap-4 shadow-lg shadow-black/20 backdrop-blur-md transition-colors",
          className,
        )}
      >
        {/* Wraps instead of squeezing: the medal stack needs ~165px, so on a
            narrow card it drops to its own right-aligned line. */}
        <CardHeader className="flex flex-row flex-wrap items-center gap-3">
          {/* Square avatar, matching the profile page. */}
          <Avatar className="border-primary/40 size-14 rounded-lg border-2">
            <AvatarImage
              src={member.avatarUrl ?? "/member-default.png"}
              alt={member.nickname}
              className="object-cover"
            />
            <AvatarFallback className="font-heading rounded-none">
              {memberInitials(member.nickname)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 grow basis-32 space-y-2">
            <p className="font-heading truncate text-lg leading-none font-semibold">
              {member.nickname}
            </p>
            <PlatformIcon platform={member.platform} platformId={member.platformId} />
          </div>
          <div className="ml-auto flex items-center gap-4 self-start">
            <MedalGroup medals={member.medals} total={member.medalCount} />
            <RankInsignia
              rank={rankForPoints(member.rankPoints)}
              size="sm"
              hint={`${formatPoints(member.rankPoints)} pts`}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-2 text-center">
            {stats.map(({ key, value }) => {
              const Icon = STAT_ICON[key];
              const leads = isStatLeader(leaders, key, member.id);
              return (
                <div key={key}>
                  <p
                    className={cn(
                      "flex items-center justify-center gap-1 font-mono text-base font-semibold tabular-nums",
                      leads && "text-yellow-300",
                    )}
                  >
                    {leads ? (
                      <Crown
                        className="size-3 shrink-0 text-yellow-400"
                        aria-label={`Líder em ${STAT_KEY_LABEL[key]}`}
                      />
                    ) : null}
                    {value}
                  </p>
                  <p className="text-muted-foreground flex items-center justify-center gap-1 text-[11px] tracking-wide uppercase">
                    <Icon className="size-3 shrink-0" aria-hidden />
                    {STAT_KEY_LABEL[key]}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
