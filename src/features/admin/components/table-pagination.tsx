"use client";

// Footer for the admin tables: how many rows are showing, how many per page, and
// the page stepper. The page size is remembered per table (see usePersistedState in
// the callers), the page number is not — a fresh visit starts at the top.

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAGE_SIZES, type PageInfo, type PageSize } from "@/lib/pagination";

interface TablePaginationProps {
  info: PageInfo;
  pageSize: PageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
  /** Plural noun for the row count, e.g. "membros". */
  itemLabel: string;
}

export function TablePagination({
  info,
  pageSize,
  onPageChange,
  onPageSizeChange,
  itemLabel,
}: TablePaginationProps) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm">
        {info.total === 0
          ? `Nenhum resultado`
          : `${info.from}–${info.to} de ${info.total} ${itemLabel}`}
      </p>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">Por página</span>
          <Select
            value={String(pageSize)}
            onValueChange={(next) => onPageSizeChange(Number(next) as PageSize)}
          >
            <SelectTrigger size="sm" className="w-[4.5rem]" aria-label="Resultados por página">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={info.page <= 1}
            onClick={() => onPageChange(info.page - 1)}
            aria-label="Página anterior"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-muted-foreground min-w-24 text-center text-sm tabular-nums">
            Página {info.page} de {info.pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={info.page >= info.pageCount}
            onClick={() => onPageChange(info.page + 1)}
            aria-label="Próxima página"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
