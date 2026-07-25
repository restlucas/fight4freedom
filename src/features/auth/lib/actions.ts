"use server";

// Login and logout run as Server Actions rather than from the browser client, so
// the invite token is set as an httpOnly cookie and never touches client JS. The
// buttons are plain forms, which also means they work without JavaScript.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getRequestOrigin } from "@/lib/app-url";
import { INVITE_COOKIE, INVITE_TTL_DAYS } from "@/lib/auth/invite";
import { publicEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Only internal paths: a redirect target from a form must never leave the site. */
function safePath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

async function discordAuthorizeUrl(next: string): Promise<string | null> {
  if (!publicEnv.supabaseConfigured) return null;

  const supabase = await createSupabaseServerClient();
  // Origin from the request, not from config: a wrong NEXT_PUBLIC_APP_URL used to
  // send production logins to localhost.
  const callback = new URL("/auth/callback", await getRequestOrigin());
  callback.searchParams.set("next", next);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "discord",
    options: {
      redirectTo: callback.toString(),
      // We do the redirecting ourselves, from the server.
      skipBrowserRedirect: true,
    },
  });
  if (error || !data.url) throw new Error("Não foi possível iniciar o login");
  return data.url;
}

/** Header button: plain login, no gate. The callback decides who gets in. */
export async function startDiscordLogin(formData: FormData) {
  const next = safePath(formData.get("next")?.toString());
  const url = await discordAuthorizeUrl(next);
  redirect(url ?? "/entrar?erro=falha");
}

/**
 * Invite page button. Stores the token in an httpOnly cookie so it survives the
 * round trip to Discord and comes back to the callback untouched by the browser.
 */
export async function startInviteLogin(formData: FormData) {
  const token = formData.get("token")?.toString();
  if (!token) redirect("/entrar?erro=sem_convite");

  const cookieStore = await cookies();
  cookieStore.set(INVITE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax, not Strict: the cookie has to survive the redirect back from Discord.
    sameSite: "lax",
    path: "/",
    maxAge: INVITE_TTL_DAYS * 24 * 60 * 60,
  });

  const url = await discordAuthorizeUrl("/");
  redirect(url ?? "/entrar?erro=falha");
}

export async function signOutAction() {
  if (publicEnv.supabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
