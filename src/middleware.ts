// Refreshes the Supabase session cookie on navigation and keeps anonymous users
// out of /admin.
//
// This is a convenience layer, NOT the authorization boundary: it only sees
// navigations. Every mutation still calls requireAdmin() (src/lib/auth/session.ts),
// because a POST to a Server Action does not pass through the checks a page does.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/lib/env";

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function redirectToLogin(request: NextRequest): NextResponse {
  const login = new URL("/entrar", request.url);
  login.searchParams.set("erro", "restrito");
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Auth not configured (or a build with no secrets): nobody can be signed in,
  // so treat every visitor as anonymous — /admin still has to be closed.
  if (!publicEnv.supabaseConfigured) {
    return isAdminPath(request.nextUrl.pathname)
      ? redirectToLogin(request)
      : response;
  }

  const supabase = createServerClient(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Touching getUser() is what refreshes an expiring token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isAdminPath(request.nextUrl.pathname)) {
    return redirectToLogin(request);
  }

  return response;
}

export const config = {
  // Skip static assets and image optimization; everything else refreshes.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|webm|ico)$).*)",
  ],
};
