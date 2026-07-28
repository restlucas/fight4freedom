"use client";

import { ArrowLeft, LayoutDashboard, LogOut, Medal, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { signOutAction } from "@/features/auth/lib/actions";
import { memberInitials } from "@/features/clan/lib/format";

const NAV = [
  { href: "/admin", label: "Visão geral", icon: LayoutDashboard },
  { href: "/admin/membros", label: "Membros", icon: Users },
  { href: "/admin/medalhas", label: "Medalhas", icon: Medal },
] as const;

interface AdminSidebarProps {
  nickname: string;
  avatarUrl: string | null;
}

export function AdminSidebar({ nickname, avatarUrl }: AdminSidebarProps) {
  const pathname = usePathname();

  // Exact match for /admin so it does not light up on every sub-route.
  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Avatar className="border-primary/40 size-7 shrink-0 rounded-md border">
            <AvatarImage src={avatarUrl ?? "/member-default.png"} alt="" />
            <AvatarFallback className="font-heading rounded-none text-[10px]">
              {memberInitials(nickname)}
            </AvatarFallback>
          </Avatar>
          <div className="grid group-data-[collapsible=icon]:hidden">
            <span className="font-heading truncate text-sm font-bold tracking-wide uppercase">
              Painel F4F
            </span>
            <span className="text-muted-foreground truncate text-xs">{nickname}</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Administração</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton asChild isActive={isActive(href)} tooltip={label}>
                    <Link href={href}>
                      <Icon />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Voltar ao site">
              <Link href="/">
                <ArrowLeft />
                <span>Voltar ao site</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            {/* POST, so no planted link can sign an admin out. */}
            <form action={signOutAction}>
              <SidebarMenuButton asChild tooltip="Sair">
                <button type="submit" className="w-full">
                  <LogOut />
                  <span>Sair</span>
                </button>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
