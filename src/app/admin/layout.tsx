import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { AdminSidebar } from "@/features/admin/components/admin-sidebar";
import { getSessionProfile } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: { default: "Painel", template: "%s · Painel F4F" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Own shell for the internal area: no public header/footer, no SEO, sidebar
 * navigation. The guard here is what closes the whole subtree — the middleware
 * only redirects anonymous visitors, it does not know who is an admin.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getSessionProfile();

  if (!profile) redirect("/entrar?erro=restrito&next=/admin");
  if (!profile.isAdmin) redirect("/entrar?erro=admin");

  return (
    // h-svh (not the default min-h-svh) gives the shell a DEFINITE height, which is
    // what lets a page hand its remaining space to a scrollable table body instead
    // of growing the document and scrolling the whole page.
    <SidebarProvider className="h-svh overflow-hidden">
      <AdminSidebar
        nickname={profile.member?.nickname ?? "Administrador"}
        avatarUrl={profile.member?.avatarUrl ?? null}
      />
      <SidebarInset className="min-h-0 overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="!h-5" />
          <span className="font-heading text-sm font-semibold tracking-wide uppercase">
            Administração
          </span>
        </header>
        {/* Scrolls only when a page genuinely needs more room (the overview on a
            short window); the table pages fit and scroll their own body. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 md:p-6">
          {children}
        </div>
      </SidebarInset>
      <Toaster position="top-right" />
    </SidebarProvider>
  );
}
