"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";

import { normalizeSearch } from "../lib/format";
import type { MedalCatalogEntry } from "../lib/queries";
import { MedalCard } from "./medal-card";

interface MedalsCatalogProps {
  medals: MedalCatalogEntry[];
}

/** Medal catalog with a client-side search over name and description. */
export function MedalsCatalog({ medals }: MedalsCatalogProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return medals;
    return medals.filter(
      (medal) =>
        normalizeSearch(medal.name).includes(q) ||
        normalizeSearch(medal.description ?? "").includes(q),
    );
  }, [medals, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="relative w-full max-w-sm">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou descrição..."
            aria-label="Buscar medalha por nome ou descrição"
            className="pl-9"
          />
        </div>
        {query.trim() ? (
          <p className="text-muted-foreground text-sm" role="status">
            {filtered.length} de {medals.length}{" "}
            {medals.length === 1 ? "medalha" : "medalhas"}
          </p>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-10 text-center">
          Nenhuma medalha encontrada.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((medal) => (
            <MedalCard key={medal.id} medal={medal} />
          ))}
        </div>
      )}
    </div>
  );
}
