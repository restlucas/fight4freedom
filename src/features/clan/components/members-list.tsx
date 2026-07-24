"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";

import type { MemberOverview } from "../lib/queries";
import { MemberCard } from "./member-card";

interface MembersListProps {
  members: MemberOverview[];
}

export function MembersList({ members }: MembersListProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.nickname.toLowerCase().includes(q));
  }, [members, query]);

  return (
    <div className="space-y-6">
      <div className="relative max-w-sm">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar membro..."
          aria-label="Buscar membro"
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-10 text-center">
          Nenhum membro encontrado.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((member) => (
            <MemberCard key={member.id} member={member} />
          ))}
        </div>
      )}
    </div>
  );
}
