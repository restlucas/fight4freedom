// Supabase client with the service role key.
//
// This key bypasses EVERY RLS policy, so it must never reach the browser. It is
// used only for Storage writes, from Server Actions already gated by
// requireAdmin() — the same app-level authorization the rest of the project uses
// (see src/lib/auth/session.ts). Deliberately not an RLS policy on
// storage.objects, which would be a second place deciding who is an admin.

import { createClient } from "@supabase/supabase-js";

import { publicEnv, serverEnv } from "@/lib/env";

export function createSupabaseAdminClient() {
  return createClient(publicEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: {
      // Nothing to persist or refresh: this client acts as the service, not a user.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
