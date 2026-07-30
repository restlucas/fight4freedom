"use client";

import { CircleHelp, Moon, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { useNow } from "@/hooks/use-now";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/utils";

import { ACTIVITY_LABEL } from "../lib/member-activity";
import type { MemberActivity, MemberActivityState } from "../lib/queries";

/** Icon per state. Text and colours live in lib/member-activity.ts. */
const ACTIVITY_ICON: Record<MemberActivityState, typeof TriangleAlert | null> = {
  playing: null,
  at_risk: Moon,
  absent: Moon,
  never_seen: Moon,
  // A question mark, not a warning: this state is the absence of information, and a
  // warning icon would read as "this member is a problem" when the problem is ours.
  unknown: CircleHelp,
};

interface MemberActivityCellProps {
  activity: MemberActivity;
}

/**
 * Whether the member is still playing — the column beside "Stats", answering the
 * question that one does not.
 *
 * The two look interchangeable and are not, which is exactly why they sit side by
 * side: a member read successfully every cycle for three weeks without playing once
 * wears a green "Sincronizando" badge, because the collection is working. Only this
 * column says nobody is home.
 */
export function MemberActivityCell({ activity }: MemberActivityCellProps) {
  const now = useNow();
  const label = ACTIVITY_LABEL[activity.state];
  const Icon = ACTIVITY_ICON[activity.state];

  /**
   * A HEALTHY MEMBER GETS NO BADGE, only the date (clan owner, 2026-07-29).
   *
   * The column speaks when there is something to say. Most of the roster is playing,
   * so a green "Jogando" on nearly every row is a pattern the eye stops reading, and
   * the amber and red ones lose the contrast that makes them worth having. It also
   * stopped competing with the green "Sincronizando" badge one column over, which is a
   * different question with the same colour.
   */
  if (activity.state === "playing") {
    return (
      <span className="text-muted-foreground text-xs whitespace-nowrap">
        {activity.lastPlayedAt !== null && now !== null
          ? `Jogou ${timeAgo(activity.lastPlayedAt, now)}`
          : "—"}
      </span>
    );
  }

  const badge = (
    <Badge variant="outline" className={cn("gap-1", label.className)}>
      {Icon ? <Icon className="size-3 shrink-0" aria-hidden /> : null}
      {label.text}
    </Badge>
  );

  return (
    <div className="flex flex-col items-start gap-0.5">
      {/* Only the states that ask for something get a hover card; "Jogando" needs no
          explanation. The trigger is a real button because Radix opens on FOCUS as
          well as pointer, which is how this reaches keyboard and touch. */}
      {label.title ? (
        <HoverCard openDelay={120} closeDelay={80}>
          <HoverCardTrigger asChild>
            <button
              type="button"
              className="focus-visible:ring-ring cursor-help rounded-full focus-visible:ring-2 focus-visible:outline-none"
              aria-label={`${label.text}: o que significa`}
            >
              {badge}
            </button>
          </HoverCardTrigger>
          <HoverCardContent align="start" className="w-80 text-xs leading-relaxed">
            <p className="font-heading mb-1.5 text-sm font-bold">{label.text}</p>
            <p className="text-muted-foreground">{label.title}</p>
          </HoverCardContent>
        </HoverCard>
      ) : (
        badge
      )}

      {/* The date under the badge, because "14+ dias" is a bucket and an admin
          deciding whether to write to someone wants the actual last time. Absent for
          the states with nothing to date. */}
      {activity.lastPlayedAt !== null && now !== null ? (
        <span className="text-muted-foreground text-[11px] whitespace-nowrap">
          Jogou {timeAgo(activity.lastPlayedAt, now)}
        </span>
      ) : null}
    </div>
  );
}
