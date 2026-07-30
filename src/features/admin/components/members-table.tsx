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

import { DeleteMemberDialog } from "./delete-member-dialog";
import { MemberActivityCell } from "./member-activity-cell";
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
import { SYNC_LABEL, SYNC_STATES_BY_URGENCY } from "@/features/admin/lib/member-sync";
import {
  nextSort,
  sortMembers,
  type MemberSort,
  type SortColumn,
} from "@/features/admin/lib/member-sort";
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

/**
 * Join date for the table: `01/10/2025`.
 *
 * IN UTC, and that is not a detail. `member.joinedAt` is a date-only column
 * (`@db.Date`), so Postgres hands back midnight UTC; formatting it in a negative
 * timezone — every Brazilian one — renders the day BEFORE. This is the one column an
 * admin might cross-check against the spreadsheet the roster was imported from, so
 * being off by a day here is worse than being ugly.
 *
 * Numeric and short because it sits in a 9% column: "1 de outubro de 2025" is what the
 * public profile uses, and it does not fit here.
 */
const JOINED_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

function formatJoinedAt(iso: string | null): string {
  // A dash, not a blank: an empty cell reads as a rendering bug, and a missing join
  // date is real — the v1 import did not carry one for every member.
  if (iso === null) return "—";
  return JOINED_FORMAT.format(new Date(iso));
}

/**
 * What each sortable column is called and what each direction DOES, in words.
 *
 * Spelled out per direction instead of assuming an arrow explains itself, because for
 * three of these five "ascending" is not obvious: nobody reads an up arrow on Cargo and
 * knows whether it means admins first or last. The strings land in `title` and in the
 * accessible name, so the answer is available before the click.
 */
const SORT_META: Record<SortColumn, { label: string; asc: string; desc: string }> = {
  nickname: { label: "Membro", asc: "de A a Z", desc: "de Z a A" },
  role: { label: "Cargo", asc: "do menor para o maior cargo", desc: "do maior para o menor cargo" },
  joinedAt: { label: "Entrou", asc: "mais antigos primeiro", desc: "mais recentes primeiro" },
  activity: {
    label: "Atividade",
    asc: "quem precisa de atenção primeiro",
    desc: "quem está jogando primeiro",
  },
  sync: {
    label: "Stats",
    asc: "quem precisa de atenção primeiro",
    desc: "quem está sincronizando primeiro",
  },
};

/**
 * A sortable column header.
 *
 * One component for all five, so a column cannot end up with a different toggle, a
 * different icon or a missing `aria-sort` from the others — which is exactly what the
 * Stats column had while it was the only sortable one.
 */
function SortableHead({
  column,
  sort,
  onSort,
  className,
}: {
  column: SortColumn;
  sort: MemberSort | null;
  onSort: (column: SortColumn) => void;
  className?: string;
}) {
  const active = sort?.column === column ? sort.direction : null;
  const meta = SORT_META[column];
  const next = nextSort(sort, column);
  // What the NEXT click does, which is what a tooltip should promise.
  const promise = next === null ? "voltar à ordem padrão" : meta[next.direction];

  return (
    <TableHead
      className={className}
      // Real table semantics, so a screen reader announces the order instead of relying
      // on the icon.
      aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onSort(column)}
        title={`Ordenar ${promise}`}
        // The visible word comes first, so the accessible name still contains the label
        // an admin is looking for.
        aria-label={`${meta.label}: ordenar ${promise}`}
        className="-ml-2 h-7 gap-1.5 px-2"
      >
        {meta.label}
        {active === "asc" ? (
          <ArrowDown className="size-3.5" />
        ) : active === "desc" ? (
          <ArrowUp className="size-3.5" />
        ) : (
          <ArrowDownUp className="size-3.5 opacity-50" />
        )}
      </Button>
    </TableHead>
  );
}

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
  const [sort, setSort] = useState<MemberSort | null>(null);
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

  const sorted = sortMembers(filtered, sort);

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

  /**
   * Cycles the clicked column through asc, desc and off, and returns to page 1 — a new
   * order means the rows an admin was looking at are somewhere else, so keeping page 4
   * would land them in the middle of a list they have not seen.
   */
  function applySort(column: SortColumn) {
    setSort((current) => nextSort(current, column));
    setPage(1);
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
              <SortableHead
                column="nickname"
                sort={sort}
                onSort={applySort}
                className="md:w-[20%]"
              />
              <SortableHead
                column="role"
                sort={sort}
                onSort={applySort}
                className="hidden lg:table-cell lg:w-[8%]"
              />
              <TableHead className="md:w-[11%]">Conta</TableHead>
              {/* Sorting by urgency, never alphabetically: alphabetical would bury
                  "ID nao encontrado" between "Fora da coleta" and "Pausado", which is the
                  opposite of what an admin opens this column to find. That rule now lives
                  in member-sort.ts, shared with Atividade. */}
              <SortableHead column="sync" sort={sort} onSort={applySort} className="md:w-[17%]" />
              {/* Beside Stats, not merged into it: the two answer different
                  questions and a member can be green in one and red in the
                  other. See MemberActivityState. */}
              {/* Beside Atividade on purpose: the two temporal columns read together,
                  so "entrou em março e não joga há 20 dias" is one glance. */}
              <SortableHead
                column="joinedAt"
                sort={sort}
                onSort={applySort}
                className="md:w-[9%]"
              />
              <SortableHead
                column="activity"
                sort={sort}
                onSort={applySort}
                className="md:w-[14%]"
              />
              {/* A PERCENTAGE PLUS A FLOOR, and the floor is the load-bearing half.
                  Under `table-fixed` a cell does not grow for its content: it clips,
                  and the content spills over the next column — which is exactly how
                  Excluir ended up rendering outside this one. The group needs ~180px
                  (four controls, gaps and cell padding), so 11rem is the hard minimum
                  and 21% is what it gets when there is room. Right-aligned, header
                  included, so the label sits over the controls it names. */}
              <TableHead className="text-right md:w-[21%] md:min-w-[11rem]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                {/* Seven columns: Membro, Cargo, Conta, Stats,
                    Entrou, Atividade, Ações. A stale colSpan leaves the empty state boxed
                    into part of the table instead of centred across it. */}
                <TableCell colSpan={7} className="text-muted-foreground h-24 text-center">
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

                  <TableCell className="text-muted-foreground text-xs">
                    {formatJoinedAt(member.joinedAt)}
                  </TableCell>

                  <TableCell>
                    <MemberActivityCell activity={member.activity} />
                  </TableCell>

                  <TableCell>
                    {/* ONE ROW OF ICONS, all the same size and the same `ghost`
                        variant, pushed to the END of the cell under the header that
                        names them. Four bordered boxes per row was a toolbar competing
                        with the data across 99 rows; ghost keeps the row calm and the
                        hover state still answers "is this a button".

                        Order reads outward from the member: what they HAVE (medalhas),
                        what they still need (convite), then the two verbs. */}
                    <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                      <MemberMedalsDialog
                        member={member}
                        medals={medals}
                        onChanged={() => router.refresh()}
                      />
                      {/* Reserved even when there is no invite to show, so the two
                          verbs after it land on the same x whether or not the member
                          already has an account. */}
                      <div className="flex w-8 shrink-0 justify-center">
                        {member.hasAccount ? null : <InviteDialog member={member} />}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditing(member)}
                        title={`Editar ${member.nickname}`}
                        aria-label={`Editar ${member.nickname}`}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      {/* Last, always: the one control here with no undo. The
                          confirmation dialog carries the weight, not the trigger. */}
                      <DeleteMemberDialog member={member} onDeleted={() => router.refresh()} />
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
