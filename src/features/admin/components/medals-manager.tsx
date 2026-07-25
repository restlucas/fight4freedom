"use client";

import type { MedalTier } from "@prisma/client";
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MedalEmblem } from "@/features/clan/components/medal-emblem";
import { MedalTierChip } from "@/features/clan/components/medal-tier-chip";
import { normalizeSearch, TIER_LABEL } from "@/features/clan/lib/format";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { isPageSize, paginate, type PageSize } from "@/lib/pagination";

import { deleteMedalAction } from "@/features/admin/lib/medal-actions";
import type { AdminMedal } from "@/features/admin/lib/queries";
import { MEDAL_TIERS } from "@/features/admin/lib/schemas";
import {
  RESPONSIVE_TABLE,
  STICKY_HEAD,
  TABLE_FRAME,
} from "@/features/admin/lib/table-styles";
import { MedalForm } from "./medal-form";
import {
  MultiSelectFilter,
  type FilterOption,
} from "./multi-select-filter";
import { TablePagination } from "./table-pagination";

interface MedalsManagerProps {
  medals: AdminMedal[];
  storageEnabled: boolean;
}

const TIER_OPTIONS: readonly FilterOption<MedalTier>[] = MEDAL_TIERS.map(
  (tier) => ({ value: tier, label: TIER_LABEL[tier] }),
);

/** Off keeps the catalog order (rarest tier first), which is the default view. */
type AwardsSort = "off" | "desc" | "asc";

const SORT_LABEL: Record<AwardsSort, string> = {
  off: "Ordenar por conquistas",
  desc: "Mais conquistadas primeiro",
  asc: "Menos conquistadas primeiro",
};

const NEXT_SORT: Record<AwardsSort, AwardsSort> = {
  off: "desc",
  desc: "asc",
  asc: "off",
};

function DeleteDialog({
  medal,
  onDone,
}: {
  medal: AdminMedal;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Calls the action directly instead of useActionState + an effect: the result
  // is handled where it arrives, so closing the dialog is not a setState inside
  // an effect (which the React Compiler rightly rejects).
  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await deleteMedalAction(null, formData);
      if (result.ok) {
        toast.success("Medalha excluída.");
        setOpen(false);
        onDone();
        return;
      }
      toast.error(result.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          aria-label={`Excluir ${medal.name}`}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir {medal.name}?</DialogTitle>
          <DialogDescription>
            {medal.holders > 0
              ? `${medal.holders} ${medal.holders === 1 ? "membro perderá" : "membros perderão"} esta medalha. A arte também é removida. Não há como desfazer.`
              : "Ninguém conquistou esta medalha ainda. A arte também é removida."}
          </DialogDescription>
        </DialogHeader>
        <form action={submit}>
          <input type="hidden" name="medalId" value={medal.id} />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MedalsManager({ medals, storageEnabled }: MedalsManagerProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [tiers, setTiers] = useState<MedalTier[]>([]);
  const [sort, setSort] = useState<AwardsSort>("off");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePersistedState<PageSize>(
    "admin/medals-page-size",
    25,
    isPageSize,
  );
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminMedal | null>(null);

  const q = normalizeSearch(query);
  const filtered = medals.filter(
    (medal) =>
      (q === "" || normalizeSearch(medal.name).includes(q)) &&
      // Empty selection means "no filter", not "match nothing".
      (tiers.length === 0 || tiers.includes(medal.tier)),
  );

  // Copy before sorting: `filtered` may be the prop array itself when no filter is
  // active, and sorting in place would mutate what the server handed us.
  const sorted =
    sort === "off"
      ? filtered
      : [...filtered].sort((a, b) =>
          sort === "desc" ? b.holders - a.holders : a.holders - b.holders,
        );

  const info = paginate(sorted.length, page, pageSize);
  const visible = sorted.slice(info.start, info.end);

  function done() {
    setCreating(false);
    setEditing(null);
    router.refresh();
  }

  /** Any filter change sends the user back to the first page of the new result. */
  function resetTo<T>(apply: (value: T) => void) {
    return (value: T) => {
      apply(value);
      setPage(1);
    };
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        {/* Search and filter on one row — see the same block in members-table.tsx. */}
        <div className="flex items-center gap-2">
          <Input
            type="search"
            value={query}
            onChange={(e) => resetTo(setQuery)(e.target.value)}
            placeholder="Buscar medalha..."
            aria-label="Buscar medalha"
            className="h-8 w-40 sm:w-56"
          />
          <MultiSelectFilter
            label="Raridade"
            options={TIER_OPTIONS}
            selected={tiers}
            onChange={resetTo(setTiers)}
          />
        </div>

        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild>
            <Button className="gap-1.5">
              <Plus className="size-4" />
              Nova medalha
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nova medalha</DialogTitle>
              <DialogDescription>
                Ela aparece no catálogo imediatamente. A concessão a membros é
                feita depois.
              </DialogDescription>
            </DialogHeader>
            <MedalForm storageEnabled={storageEnabled} onDone={done} />
          </DialogContent>
        </Dialog>
      </div>

      <div className={TABLE_FRAME}>
        <Table className={RESPONSIVE_TABLE}>
          <TableHeader className={STICKY_HEAD}>
            <TableRow>
              <TableHead className="md:w-[34%]">Medalha</TableHead>
              <TableHead className="hidden md:table-cell md:w-[34%]">
                Como conquistar
              </TableHead>
              <TableHead
                className="md:w-[16%]"
                // Real table semantics, so screen readers announce the order
                // instead of relying on the icon.
                aria-sort={
                  sort === "desc"
                    ? "descending"
                    : sort === "asc"
                      ? "ascending"
                      : "none"
                }
              >
                {/* The sort lives on the column it sorts, so "who earned the most"
                    is one click away from where the numbers are. */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSort(NEXT_SORT[sort])}
                  title={SORT_LABEL[NEXT_SORT[sort]]}
                  className="-ml-2 h-7 gap-1.5 px-2"
                >
                  Conquistas
                  {sort === "desc" ? (
                    <ArrowDown className="size-3.5" />
                  ) : sort === "asc" ? (
                    <ArrowUp className="size-3.5" />
                  ) : (
                    <ArrowDownUp className="size-3.5 opacity-50" />
                  )}
                </Button>
              </TableHead>
              <TableHead className="md:w-[16%]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-muted-foreground h-24 text-center"
                >
                  {medals.length === 0
                    ? "Nenhuma medalha cadastrada."
                    : "Nenhuma medalha encontrada com esses filtros."}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((medal) => (
                <TableRow key={medal.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <MedalEmblem
                        name={medal.name}
                        tier={medal.tier}
                        imageUrl={medal.imageUrl}
                        icon={medal.icon}
                        size="xs"
                      />
                      <div className="min-w-0">
                        <p className="font-heading truncate font-semibold">
                          {medal.name}
                        </p>
                        <MedalTierChip tier={medal.tier} />
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="hidden md:table-cell">
                    <span className="text-muted-foreground line-clamp-2 text-sm">
                      {medal.criteria ?? "—"}
                    </span>
                  </TableCell>

                  <TableCell>
                    <span className="font-mono text-sm tabular-nums">
                      {medal.holders}
                    </span>
                  </TableCell>

                  <TableCell>
                    {/* Left-aligned, under the "Ações" header. */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(medal)}
                        className="w-24 justify-start gap-1.5"
                      >
                        <Pencil className="size-3.5" />
                        <span className="hidden sm:inline">Editar</span>
                      </Button>
                      <DeleteDialog medal={medal} onDone={done} />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <TablePagination
        info={info}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={resetTo(setPageSize)}
        itemLabel="medalhas"
      />

      <Dialog
        open={editing !== null}
        onOpenChange={(next) => !next && setEditing(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar {editing?.name}</DialogTitle>
            <DialogDescription>
              Alterações aparecem no catálogo imediatamente.
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <MedalForm
              medal={editing}
              storageEnabled={storageEnabled}
              onDone={done}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
