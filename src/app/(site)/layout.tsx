import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { DiscordLoginButton } from "@/features/auth/components/discord-login-button";
import { UserMenu } from "@/features/auth/components/user-menu";
import { getSessionProfile, needsIdentityConfirmation } from "@/lib/auth/session";
import { PATHNAME_HEADER } from "@/lib/request-headers";

/** Where an unconfirmed member is sent, and the one page they are allowed on. */
const IDENTITY_GATE_PATH = "/confirmar-conta";

/**
 * Pages that must stay reachable while the gate is up.
 *
 * `/entrar` and `/convite` are how someone gets a session in the first place, so
 * gating them would be a redirect loop. Note what is NOT here and does not need to
 * be: `/admin` has its own layout outside this group, which doubles as the escape
 * hatch — an admin can always reach the panel to fix a member who is stuck.
 */
const GATE_EXEMPT = [IDENTITY_GATE_PATH, "/entrar", "/convite"];

/**
 * Public vitrine shell. A route group, so the URLs are unchanged — it exists only
 * to keep this header/footer away from /admin, which has its own sidebar shell.
 *
 * It also hosts the identity gate, because it is the one place that already loads
 * the session for the header (so the check is free) and wraps every public page.
 * One honest limit: Next caches layouts across client-side navigations, so this
 * catches full loads, not every in-app link. It is a funnel, not a security
 * boundary — the boundary is that an unconfirmed member simply has no stats, and
 * every action still checks for itself.
 */
export default async function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const profile = await getSessionProfile();

  if (needsIdentityConfirmation(profile)) {
    const pathname = (await headers()).get(PATHNAME_HEADER) ?? "";
    const exempt = GATE_EXEMPT.some((path) => pathname === path || pathname.startsWith(`${path}/`));
    if (!exempt) redirect(IDENTITY_GATE_PATH);
  }

  return (
    <>
      <SiteHeader account={profile ? <UserMenu profile={profile} /> : <DiscordLoginButton />} />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </>
  );
}
