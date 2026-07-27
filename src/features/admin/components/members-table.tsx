"use client";

import type { MemberRole, Platform } from "@prisma/client";
import { Pencil, Plus, ShieldCheck, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
import { usePersistedState } from "@/hooks/use-persisted-state";
import { isPageSize, paginate, type PageSize } from "@/lib/pagination";

import { MemberSyncCell } from "@/features/admin/components/member-sync-cell";
import type { AdminMedal, AdminMember } from "@/features/admin/lib/queries";
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

export function MembersTable({ members, medals }: MembersTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [roles, setRoles] = useState<MemberRole[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePersistedState<PageSize>(
    "admin/members-page-size",
    25,
    isPageSize,
  );
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminMember | null>(null);

  const q = normalizeSearch(query);
  const filtered = members.filter(
    (member) =>
      (q === "" || normalizeSearch(member.nickname).includes(q)) &&
      // Empty selection means "no filter", not "match nothing".
      (roles.length === 0 || roles.includes(member.role)) &&
      (platforms.length === 0 || platforms.includes(member.platform)),
  );

  // paginate() clamps, so narrowing the filters while on page 4 lands on the last
  // page that still exists instead of showing an empty table.
  const info = paginate(filtered.length, page, pageSize);
  const visible = filtered.slice(info.start, info.end);

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
        </div>

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
              <TableHead className="md:w-[18%]">Stats</TableHead>
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
