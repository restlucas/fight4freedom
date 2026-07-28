"use client";

import type { MemberRole, Platform } from "@prisma/client";
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlatformIcon } from "@/features/clan/components/platform-icon";
import {
  memberInitials,
  normalizeSearch,
  PLATFORM_LABEL,
  ROLE_LABEL,
} from "@/features/clan/lib/format";
import { useNow } from "@/hooks/use-now";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { isPageSize, paginate, type PageSize } from "@/lib/pagination";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/utils";

import { MemberSyncCell } from "@/features/admin/components/member-sync-cell";
import { SYNC_LABEL, SYNC_STATES_BY_URGENCY, syncUrgency } from "@/features/admin/lib/member-sync";
import type { AdminMedal, AdminMember, MemberSyncState } from "@/features/admin/lib/queries";
import { MEMBER_ROLES, PLATFORMS } from "@/features/admin/lib/schemas";
import { RESPONSIVE_TABLE, STICKY_HEAD, TABLE_FRAME } from "@/features/admin/lib/table-styles";
import { InviteDialog } from "./invite-dialog";
import { MemberForm } from "./member-form";
import { MemberMedalsDialog } from "./member-medals-dialog";
import { MultiSelectFilter, type FilterOption } from "./multi-select-filter";
import { TablePagination } from "./table-pagination";

interface MembersTableProps {
  members: AdminMember[];
  /** The catalog, so the medal dialog can grant without another round trip. */
  medals: AdminMedal[];
}

const ROLE_OPTIONS: readonly FilterOption<MemberRole>[] = MEMBER_ROLES.map((role) => ({
  value: role,
  label: ROLE_LABEL[role],
}));

const PLATFORM_OPTIONS: readonly FilterOption<Platform>[] = PLATFORMS.map((platform) => ({
  value: platform,
  label: PLATFORM_LABEL[platform],
}));

/** Listed by urgency, not alphabetically — the filter reads as a triage list. */
const SYNC_OPTIONS: readonly FilterOption<MemberSyncState>[] = SYNC_STATES_BY_URGENCY.map(
  (state) => ({ value: state, label: SYNC_LABEL[state].text }),
);

/** Off keeps the default order (active first, then nickname). */
type SyncSort = "off" | "urgent" | "healthy";

const SYNC_SORT_LABEL: Record<SyncSort, string> = {
  off: "Ordenar por status da coleta",
  urgent: "Quem precisa de atenção primeiro",
  healthy: "Quem está sincronizando primeiro",
};

const NEXT_SYNC_SORT: Record<SyncSort, SyncSort> = {
  off: "urgent",
  urgent: "healthy",
  healthy: "off",
};

/**
 * When the collector last SUCCESSFULLY read any member on the roster.
 *
 * Reads and not attempts: attempts move even when every one of them fails, so a
 * header built on `checkedAt` would cheerfully report "há 1 min" through a total
 * outage. This line is supposed to be the one place an admin can glance at to
 * know the data is real.
 *
 * Newest and not oldest: the question is "is the collection working", and one
 * neglected member at the back of the queue does not mean it stopped.
 */
function lastCollection(members: readonly AdminMember[]): string | null {
  let latest: string | null = null;
  for (const member of members) {
    const at = member.sync.readAt;
    // String comparison is safe here: every value comes from `toISOString()`,
    // which is fixed-width UTC, so lexical order IS chronological order.
    if (at !== null && (latest === null || at > latest)) latest = at;
  }
  return latest;
}

export function MembersTable({ members, medals }: MembersTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [roles, setRoles] = useState<MemberRole[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [syncStates, setSyncStates] = useState<MemberSyncState[]>([]);
  const [syncSort, setSyncSort] = useState<SyncSort>("off");
  const [refreshing, startRefresh] = useTransition();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePersistedState<PageSize>(
    "admin/members-page-size",
    25,
    isPageSize,
  );
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminMember | null>(null);
  const now = useNow();
  const lastCollectedAt = lastCollection(members);

  const q = normalizeSearch(query);
  const filtered = members.filter(
    (member) =>
      (q === "" || normalizeSearch(member.nickname).includes(q)) &&
      // Empty selection means "no filter", not "match nothing".
      (roles.length === 0 || roles.includes(member.role)) &&
      (platforms.length === 0 || platforms.includes(member.platform)) &&
      (syncStates.length === 0 || syncStates.includes(member.sync.state)),
  );

  // Copy before sorting: `filtered` may be the prop array itself when no filter is
  // active, and sorting in place would mutate what the server handed us.
  const sorted =
    syncSort === "off"
      ? filtered
      : [...filtered].sort((a, b) => {
          const delta = syncUrgency(a.sync.state) - syncUrgency(b.sync.state);
          // Nickname breaks ties so the order is stable between renders instead
          // of depending on how the rows came out of the database.
          return (
            (syncSort === "urgent" ? delta : -delta) ||
            a.nickname.localeCompare(b.nickname, "pt-BR")
          );
        });

  // paginate() clamps, so narrowing the filters while on page 4 lands on the last
  // page that still exists instead of showing an empty table.
  const info = paginate(sorted.length, page, pageSize);
  const visible = sorted.slice(info.start, info.end);

  // The table is server-rendered; refresh after a write so it reflects the change.
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
        {/* Search and both filters on one row. The search is narrow and does not
            grow, otherwise it eats the row and pushes the filters to a second line. */}
        <div className="flex items-center gap-2">
          <Input
            type="search"
            value={query}
            onChange={(e) => resetTo(setQuery)(e.target.value)}
            placeholder="Buscar membro..."
            aria-label="Buscar membro"
            className="h-8 w-40 sm:w-56"
          />
          <MultiSelectFilter
            label="Cargo"
            options={ROLE_OPTIONS}
            selected={roles}
            onChange={resetTo(setRoles)}
          />
          <MultiSelectFilter
            label="Plataforma"
            options={PLATFORM_OPTIONS}
            selected={platforms}
            onChange={resetTo(setPlatforms)}
          />
          <MultiSelectFilter
            label="Stats"
            options={SYNC_OPTIONS}
            selected={syncStates}
            onChange={resetTo(setSyncStates)}
          />
          {/* The Stats column is server-rendered and the collector runs on its own
              schedule, so the page can be minutes behind without anything being
              wrong. Polling would hammer the database for a panel nobody is
              staring at; a button costs nothing and is honest about being manual. */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => startRefresh(() => router.refresh())}
            disabled={refreshing}
            title="Buscar o estado atual da coleta"
            className="h-8 gap-1.5"
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            Atualizar
          </Button>
        </div>

        <div className="flex items-center gap-3">
          {/* One line for the whole roster instead of a timestamp under every
              badge: the collector sweeps everyone in the same runs, so ~100
              per-row counters were ~100 copies of one fact. It ticks on its own
              (useNow), because a frozen relative time reads as fresh. */}
          <p className="text-muted-foreground text-xs whitespace-nowrap">
            {lastCollectedAt === null
              ? "A coleta ainda não rodou"
              : `Última coleta de dados ${now === null ? "…" : timeAgo(lastCollectedAt, now)}`}
          </p>
          <Separator orientation="vertical" className="data-[orientation=vertical]:h-5" />

          <Dialog open={creating} onOpenChange={setCreating}>
            <DialogTrigger asChild>
              <Button className="gap-1.5">
                <Plus className="size-4" />
                Novo membro
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo membro</DialogTitle>
                <DialogDescription>
                  Cadastre o membro e depois gere o convite para ele vincular a conta do Discord.
                </DialogDescription>
              </DialogHeader>
              <MemberForm onDone={done} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Percentage widths + table-fixed from md up: every row sizes its columns
          identically (a medal counter or a long nick cannot shift the buttons) and
          nothing forces a horizontal scrollbar on desktop. */}
      <div className={TABLE_FRAME}>
        <Table className={RESPONSIVE_TABLE}>
          <TableHeader className={STICKY_HEAD}>
            <TableRow>
              <TableHead className="md:w-[32%]">Membro</TableHead>
              <TableHead className="hidden lg:table-cell lg:w-[10%]">Cargo</TableHead>
              <TableHead className="md:w-[14%]">Conta</TableHead>
              <TableHead
                className="md:w-[18%]"
                // Real table semantics, so screen readers announce the order
                // instead of relying on the icon.
                aria-sort={
                  syncSort === "urgent"
                    ? "ascending"
                    : syncSort === "healthy"
                      ? "descending"
                      : "none"
                }
              >
                {/* Sorting by urgency, never alphabetically: alphabetical would
                    bury "ID não encontrado" between "Fora da coleta" and
                    "Pausado", which is the opposite of what an admin opens this
                    column to find. */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => resetTo(setSyncSort)(NEXT_SYNC_SORT[syncSort])}
                  title={SYNC_SORT_LABEL[NEXT_SYNC_SORT[syncSort]]}
                  // The filter trigger in the toolbar is also called "Stats", so
                  // without this both controls share one accessible name. Keeps
                  // the visible word first, so the name still contains the label.
                  aria-label={`Stats: ${SYNC_SORT_LABEL[NEXT_SYNC_SORT[syncSort]].toLowerCase()}`}
                  className="-ml-2 h-7 gap-1.5 px-2"
                >
                  Stats
                  {syncSort === "urgent" ? (
                    <ArrowDown className="size-3.5" />
                  ) : syncSort === "healthy" ? (
                    <ArrowUp className="size-3.5" />
                  ) : (
                    <ArrowDownUp className="size-3.5 opacity-50" />
                  )}
                </Button>
              </TableHead>
              <TableHead className="md:w-[26%]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground h-24 text-center">
                  {members.length === 0
                    ? "Nenhum membro cadastrado."
                    : "Nenhum membro encontrado com esses filtros."}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((member) => (
                <TableRow key={member.id} className={member.active ? "" : "opacity-60"}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-9 rounded-md">
                        <AvatarImage src={member.avatarUrl ?? "/member-default.png"} alt="" />
                        <AvatarFallback className="font-heading rounded-none text-xs">
                          {memberInitials(member.nickname)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-heading flex items-center gap-1.5 truncate font-semibold">
                          {member.nickname}
                          {member.isAdmin ? (
                            <ShieldCheck
                              className="text-primary size-3.5"
                              aria-label="Administrador"
                            />
                          ) : null}
                        </p>
                        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                          <PlatformIcon
                            platform={member.platform}
                            platformId={member.platformId}
                            className="size-3.5"
                          />
                          {member.platformId ?? "sem id"}
                          {member.active ? null : " · inativo"}
                        </div>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="hidden lg:table-cell">
                    <span className="text-muted-foreground text-sm">{ROLE_LABEL[member.role]}</span>
                  </TableCell>

                  {/* "Conta" is about Discord login only. Whether stats collect is
                      a different question with its own column — they used to be
                      conflated here, which is why "Stats pendentes" showed up
                      inside the account cell and confused the two. */}
                  <TableCell>
                    {member.hasAccount ? (
                      <Badge variant="secondary">Vinculada</Badge>
                    ) : member.pendingInvite ? (
                      <Badge variant="outline" className="gap-1">
                        Convite pendente
                        {member.pendingInvite.grantsAdmin ? " (admin)" : ""}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">Sem conta</span>
                    )}
                  </TableCell>

                  <TableCell>
                    <MemberSyncCell
                      memberId={member.id}
                      nickname={member.nickname}
                      sync={member.sync}
                      onChanged={() => router.refresh()}
                    />
                  </TableCell>

                  <TableCell>
                    {/* Each action gets a fixed slot, and the invite slot is
                        reserved even when there is no invite to show. Otherwise
                        the medal counter and the missing invite button push the
                        buttons around and no two rows line up. Left-aligned, so the
                        buttons sit under the "Ações" header. */}
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <div className="flex w-24">
                        {member.hasAccount ? null : <InviteDialog member={member} />}
                      </div>
                      <MemberMedalsDialog
                        member={member}
                        medals={medals}
                        onChanged={() => router.refresh()}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(member)}
                        className="w-24 justify-start gap-1.5"
                      >
                        <Pencil className="size-3.5" />
                        <span className="hidden sm:inline">Editar</span>
                      </Button>
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
        itemLabel="membros"
      />

      <Dialog open={editing !== null} onOpenChange={(next) => !next && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-4" />
              Editar {editing?.nickname}
            </DialogTitle>
            <DialogDescription>Alterações aparecem na vitrine imediatamente.</DialogDescription>
          </DialogHeader>
          {editing ? <MemberForm member={editing} onDone={done} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
