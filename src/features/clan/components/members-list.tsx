"use client";

import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { normalizeSearch } from "../lib/format";
import type { MemberOverview } from "../lib/queries";
import {
  sortByStat,
  STAT_KEY_LABEL,
  STAT_KEYS,
  type SortDirection,
  type StatKey,
  type StatLeaders,
} from "../lib/stat-keys";
import { MemberCard } from "./member-card";

interface MembersListProps {
  members: MemberOverview[];
  leaders?: StatLeaders;
}

export function MembersList({ members, leaders }: MembersListProps) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<StatKey>("kd");
  const [direction, setDirection] = useState<SortDirection>("desc");

  // Clicking the active stat flips the direction, so there is no separate
  // asc/desc control taking up space.
  function selectSort(key: StatKey) {
    if (key === sortKey) {
      setDirection((current) => (current === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(key);
    setDirection("desc");
  }

  const visible = useMemo(() => {
    const q = normalizeSearch(query);
    const filtered = q ? members.filter((m) => normalizeSearch(m.nickname).includes(q)) : members;
    return sortByStat(filtered, sortKey, direction);
  }, [members, query, sortKey, direction]);

  const DirectionIcon = direction === "desc" ? ArrowDown : ArrowUp;

  return (
    <div className="space-y-6">
      {/* Glass panel so the controls stay readable over the page background. */}
      <div className="bg-card/70 flex flex-wrap items-center gap-3 rounded-xl border p-3 shadow-lg shadow-black/20 backdrop-blur-md">
        <div className="relative w-full max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar membro..."
            aria-label="Buscar membro"
            className="bg-background/50 pl-9"
          />
        </div>

        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Ordenar membros"
        >
          <span className="text-muted-foreground mr-1 text-[11px] tracking-widest uppercase">
            Ordenar
          </span>
          {STAT_KEYS.map((key) => {
            const active = key === sortKey;
            return (
              <button
                key={key}
                type="button"
                onClick={() => selectSort(key)}
                aria-pressed={active}
                title={
                  active
                    ? `${STAT_KEY_LABEL[key]}: ${
                        direction === "desc" ? "maior primeiro" : "menor primeiro"
                      } (clique para inverter)`
                    : `Ordenar por ${STAT_KEY_LABEL[key]}`
                }
                className={cn(
                  "focus-visible:ring-ring inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
                  active
                    ? "border-primary/60 bg-primary/20 text-foreground"
                    : "text-muted-foreground bg-background/40 hover:border-primary/40 hover:text-foreground",
                )}
              >
                {STAT_KEY_LABEL[key]}
                {active ? <DirectionIcon className="size-3" /> : null}
              </button>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-muted-foreground bg-card/60 rounded-lg border border-dashed p-10 text-center backdrop-blur-sm">
          Nenhum membro encontrado.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((member) => (
            <MemberCard key={member.id} member={member} leaders={leaders} />
          ))}
        </div>
      )}
    </div>
  );
}
