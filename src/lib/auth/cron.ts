// Shared secret check for the machine-to-machine routes: the collection trigger
// and the cache purge the Railway worker calls when a cycle wrote something.
//
// Extracted so both routes compare the header the same way. The comparison is
// timing-safe and length-checked first, because `timingSafeEqual` throws on
// mismatched lengths — and a thrown comparison is an unauthorized request that
// returns a 500 instead of a 401.

import { timingSafeEqual } from "node:crypto";

import { serverEnv } from "@/lib/env";

/** Whether the request carries `Authorization: Bearer $CRON_SECRET`. */
export function isCronAuthorized(request: Request): boolean {
  let secret: string;
  try {
    secret = serverEnv.cronSecret;
  } catch {
    // Env not configured: fail closed, never open.
    return false;
  }
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
