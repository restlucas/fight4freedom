"use server";

// Medal mutations. Same rule as every admin action: requireAdmin() first, because
// the middleware only guards navigation and a POST straight to the action would
// otherwise go through.

import { requireAdmin } from "@/lib/auth/session";
import { CACHE_TAG, revalidateVitrine } from "@/lib/cache";
import { db } from "@/lib/db";
import { serverEnv } from "@/lib/env";

import { deleteMedalImage, uploadMedalImage } from "./medal-storage";
import {
  actionError,
  medalFormSchema,
  medalIdSchema,
  type ActionResult,
} from "./schemas";

function fieldErrorsOf(error: {
  issues: { path: (string | number | symbol)[]; message: string }[];
}): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    map[key] = [...(map[key] ?? []), issue.message];
  }
  return map;
}

function parseForm(formData: FormData) {
  return medalFormSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
    criteria: formData.get("criteria") ?? undefined,
    tier: formData.get("tier"),
    icon: formData.get("icon") ?? undefined,
  });
}

/** The uploaded file, or null when the field was left empty. */
function fileFrom(formData: FormData): File | null {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return null;
  return file;
}

export async function createMedalAction(
  _prev: ActionResult<{ medalId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ medalId: string }>> {
  const admin = await requireAdmin();

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return actionError("Confira os campos.", fieldErrorsOf(parsed.error));
  }

  const file = fileFrom(formData);
  let imageUrl: string | null = null;
  if (file) {
    if (!serverEnv.storageConfigured) {
      return actionError("Upload indisponível: storage não configurado.");
    }
    const upload = await uploadMedalImage(file);
    if (!upload.ok) return actionError(upload.error, { image: [upload.error] });
    imageUrl = upload.url;
  }

  const medal = await db.medal.create({
    data: { ...parsed.data, imageUrl, createdBy: admin.id },
    select: { id: true },
  });

  revalidateVitrine(CACHE_TAG.medals);
  return { ok: true, data: { medalId: medal.id } };
}

export async function updateMedalAction(
  _prev: ActionResult<{ medalId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ medalId: string }>> {
  await requireAdmin();

  const id = medalIdSchema.safeParse({ medalId: formData.get("medalId") });
  if (!id.success) return actionError("Medalha inválida.");

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return actionError("Confira os campos.", fieldErrorsOf(parsed.error));
  }

  const current = await db.medal.findUnique({
    where: { id: id.data.medalId },
    select: { imageUrl: true },
  });
  if (!current) return actionError("Medalha não encontrada.");

  const file = fileFrom(formData);
  let imageUrl = current.imageUrl;

  if (file) {
    if (!serverEnv.storageConfigured) {
      return actionError("Upload indisponível: storage não configurado.");
    }
    const upload = await uploadMedalImage(file);
    if (!upload.ok) return actionError(upload.error, { image: [upload.error] });
    imageUrl = upload.url;
    // Only after the new one is safely stored, so a failed upload never leaves
    // the medal without artwork.
    await deleteMedalImage(current.imageUrl);
  } else if (formData.get("removeImage") === "on") {
    imageUrl = null;
    await deleteMedalImage(current.imageUrl);
  }

  await db.medal.update({
    where: { id: id.data.medalId },
    data: { ...parsed.data, imageUrl },
  });

  revalidateVitrine(CACHE_TAG.medals);
  return { ok: true, data: { medalId: id.data.medalId } };
}

/**
 * Deleting a medal cascades to its awards (schema onDelete: Cascade), so every
 * member loses it. The UI states how many before asking for confirmation.
 */
export async function deleteMedalAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const id = medalIdSchema.safeParse({ medalId: formData.get("medalId") });
  if (!id.success) return actionError("Medalha inválida.");

  const medal = await db.medal.findUnique({
    where: { id: id.data.medalId },
    select: { imageUrl: true },
  });
  if (!medal) return actionError("Medalha não encontrada.");

  await db.medal.delete({ where: { id: id.data.medalId } });
  await deleteMedalImage(medal.imageUrl);

  revalidateVitrine(CACHE_TAG.medals, CACHE_TAG.members);
  return { ok: true, data: undefined };
}
