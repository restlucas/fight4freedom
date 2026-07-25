// Where the app is actually being served from.
//
// Server-only: reads the incoming request. This is deliberately NOT taken from
// NEXT_PUBLIC_APP_URL first, because that config duplicates a fact the request
// already carries, and getting it wrong fails in the worst way — a production
// login redirecting to localhost, or an invite link that only works on the
// admin's machine. Deriving it from the request is also what makes preview
// deployments (whose URL changes every time) work without touching config.
//
// The env var stays as the fallback for contexts with no request (scripts, and
// metadataBase, which is static).

import { headers } from "next/headers";

import { publicEnv } from "@/lib/env";

/**
 * Absolute origin of the current request, e.g. "https://fight4freedom.com.br".
 *
 * On Vercel the proxy sets x-forwarded-*; a client could forge those headers, so
 * this must not be used for authorization. For OAuth redirects the real guard is
 * Supabase's redirect allowlist, and an invite link is reviewed by the admin who
 * generated it before being sent.
 */
export async function getRequestOrigin(): Promise<string> {
  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") ?? headerList.get("host") ?? null;

  if (!host) return publicEnv.appUrl;

  const proto =
    headerList.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");

  return `${proto}://${host}`;
}
