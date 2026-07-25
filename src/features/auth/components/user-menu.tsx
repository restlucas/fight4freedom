import { LayoutDashboard, LogOut, User } from "lucide-react";
import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/features/auth/lib/actions";
import { memberInitials } from "@/features/clan/lib/format";
import type { SessionProfile } from "@/lib/auth/session";

interface UserMenuProps {
  profile: SessionProfile;
}

/** Signed-in menu. "Painel" only renders for admins, and the route is guarded too. */
export function UserMenu({ profile }: UserMenuProps) {
  const nickname = profile.member?.nickname ?? "Minha conta";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label="Abrir menu da conta"
        >
          <Avatar className="border-primary/40 size-8 border">
            <AvatarImage
              src={profile.member?.avatarUrl ?? "/member-default.png"}
              alt=""
            />
            <AvatarFallback className="font-heading text-xs">
              {memberInitials(nickname)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="font-heading truncate">
          {nickname}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {profile.memberId ? (
          <DropdownMenuItem asChild>
            <Link href={`/membros/${profile.memberId}`}>
              <User className="size-4" />
              Meu perfil
            </Link>
          </DropdownMenuItem>
        ) : null}

        {profile.isAdmin ? (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <LayoutDashboard className="size-4" />
              Painel
            </Link>
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          {/* A form, so signing out is a POST and cannot be triggered by a link
              someone else plants (CSRF on logout is minor but free to avoid). */}
          <form action={signOutAction}>
            <button type="submit" className="flex w-full items-center gap-2">
              <LogOut className="size-4" />
              Sair
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
