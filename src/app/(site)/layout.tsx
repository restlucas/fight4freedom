import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { DiscordLoginButton } from "@/features/auth/components/discord-login-button";
import { UserMenu } from "@/features/auth/components/user-menu";
import { getSessionProfile } from "@/lib/auth/session";

/**
 * Public vitrine shell. A route group, so the URLs are unchanged — it exists only
 * to keep this header/footer away from /admin, which has its own sidebar shell.
 */
export default async function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const profile = await getSessionProfile();

  return (
    <>
      <SiteHeader account={profile ? <UserMenu profile={profile} /> : <DiscordLoginButton />} />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </>
  );
}
