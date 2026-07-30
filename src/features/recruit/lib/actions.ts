"use server";

// The public candidature. THE ONLY WRITE IN THIS PROJECT WITH NO AUTHENTICATION, which
// is what every decision below answers to.
//
// WHY A ROW HERE IS SAFE TO CREATE. It is inert by construction: a `recruit` appears on
// no vitrine, scores in no ranking, is read by no collector and grants no login. Only an
// admin approving it creates a `member`. The worst a flood achieves is a queue an admin
// has to clear, never a polluted roster or a corrupted board — which is exactly why the
// endpoint creates a candidature and not a member.
//
// FOUR CHEAP DEFENCES, and none of them pretends to be a CAPTCHA:
//
//   honeypot        a field a human never sees, so anything in it is a bot
//   minimum time    a form posted in under 4 s was not read
//   per-IP ceiling  an hourly cap on how many one sender may leave
//   bounded input   every field length-capped in the schema before it reaches the db
//
// The point is proportion: this is a clan recruitment form that gets a handful of
// submissions a week. A real CAPTCHA is a third-party dependency and a consent banner
// for a problem nobody has yet, and these four cost nothing and stop the automated
// submitter that finds any public form eventually.

import { createHash } from "node:crypto";

import { headers } from "next/headers";

import { actionError, fieldErrorsOf, type ActionResult } from "@/lib/action-result";
import { db } from "@/lib/db";

import { recruitFormSchema } from "./schemas";

/**
 * How many candidatures one sender may leave per hour.
 *
 * Generous on purpose: a household or a LAN party shares an address, and two friends
 * applying from the same wifi must not lock each other out. It bounds a flood, it does
 * not police normal use.
 */
const MAX_PER_IP_PER_HOUR = 5;

/**
 * SHA-256 of the caller's IP, or null when no proxy header is present.
 *
 * HASHED, never stored raw. Rate limiting only needs to know it is the same sender, and
 * nothing downstream needs to know who — so the address never lands in the database and
 * cannot leak from it.
 *
 * Null on a local run, where the header is absent. That degrades to "no rate limit"
 * rather than to "reject", because refusing a submission over a missing proxy header
 * would break the form on any deployment shaped differently from ours.
 */
async function ipHashOf(): Promise<string | null> {
  const store = await headers();
  // `x-forwarded-for` is a list; the client is the first entry.
  const forwarded = store.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || store.get("x-real-ip")?.trim();
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex");
}

export async function submitRecruitAction(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  const parsed = recruitFormSchema.safeParse({
    realName: formData.get("realName"),
    whatsapp: formData.get("whatsapp"),
    nickname: formData.get("nickname"),
    declaredEaName: formData.get("declaredEaName"),
    declaredEaUsername: formData.get("declaredEaUsername") ?? undefined,
    discordHandle: formData.get("discordHandle") ?? undefined,
    platform: formData.get("platform"),
    ageBracket: formData.get("ageBracket"),
    hasGame: formData.get("hasGame"),
    referral: formData.get("referral") ?? undefined,
    website: formData.get("website") ?? undefined,
    elapsedSeconds: formData.get("elapsedSeconds") ?? 0,
  });

  if (!parsed.success) {
    const fieldErrors = fieldErrorsOf(parsed.error);
    // The honeypot and the timer are answered with the SAME generic message as any
    // other rejection, and never with what tripped them. Telling a submitter which
    // trap it hit is telling it how to pass next time.
    if (fieldErrors.website || fieldErrors.elapsedSeconds) {
      return actionError("Não foi possível enviar. Confira os campos e tente de novo.");
    }
    return actionError("Confira os campos destacados.", fieldErrors);
  }

  const data = parsed.data;
  const ipHash = await ipHashOf();

  if (ipHash) {
    const recent = await db.recruit.count({
      where: { ipHash, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
    });
    if (recent >= MAX_PER_IP_PER_HOUR) {
      return actionError(
        "Você já enviou várias candidaturas na última hora. Aguarde um pouco — a gente vai responder.",
      );
    }
  }

  try {
    await db.recruit.create({
      data: {
        realName: data.realName,
        whatsapp: data.whatsapp,
        nickname: data.nickname,
        // Stored exactly as typed, trimmed and never normalised: the accents, the clan
        // tag and the casing are the evidence an admin works from when EA's search
        // finds nothing. Same rule as `identityClaim.declaredName`.
        declaredEaName: data.declaredEaName,
        declaredEaUsername: data.declaredEaUsername,
        discordHandle: data.discordHandle,
        platform: data.platform as "ea" | "xbox" | "psn",
        ageBracket: data.ageBracket as
          "age_12_17" | "age_17_25" | "age_25_30" | "age_30_40" | "age_40_plus",
        hasGame: data.hasGame === "sim",
        referral: data.referral,
        ipHash,
      },
    });
  } catch (error) {
    // Never the database's message: it would describe our schema to anyone poking at
    // a public endpoint.
    console.error("[recruit] falha ao gravar candidatura:", error);
    return actionError("Não foi possível enviar agora. Tente de novo em alguns minutos.");
  }

  // No `revalidate` of anything: a candidature changes no public page, and the admin
  // queue is uncached like the rest of the panel.
  return { ok: true, data: undefined };
}
