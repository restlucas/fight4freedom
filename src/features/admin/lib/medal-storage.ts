// Medal artwork in Supabase Storage.
//
// Every upload is re-encoded with sharp before it is stored. That caps the size
// permanently (instead of relying on the CDN to resize a 500 KB original on every
// request) and, as a side effect, strips metadata and anything hidden in the
// original bytes: the file that lands in the bucket is one we generated.

import { randomUUID } from "node:crypto";

import sharp from "sharp";

import { validateImageBytes } from "@/lib/images";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Exact bucket name, case-sensitive in the Storage API. */
export const MEDAL_BUCKET = "F4F-Medals";

/** Emblems are circular and render at 64px at most; 512 covers retina with room. */
const MAX_DIMENSION = 512;

export type UploadResult = { ok: true; url: string; path: string } | { ok: false; error: string };

/**
 * Validates, re-encodes to WebP and stores the artwork.
 * Callers must have already passed requireAdmin().
 */
export async function uploadMedalImage(file: File): Promise<UploadResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  const validation = validateImageBytes(bytes);
  if (!validation.ok) return { ok: false, error: validation.error };

  let webp: Buffer;
  try {
    webp = await sharp(bytes)
      .resize(MAX_DIMENSION, MAX_DIMENSION, {
        // Never crop and never upscale: the art is square by convention, and
        // enlarging a small file only wastes bytes.
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .toBuffer();
  } catch {
    return { ok: false, error: "Não foi possível processar a imagem." };
  }

  // Name generated here: the uploaded filename is attacker-controlled (path
  // traversal, collisions, odd unicode).
  const path = `${randomUUID()}.webp`;
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.storage
    .from(MEDAL_BUCKET)
    .upload(path, webp, { contentType: "image/webp", upsert: false });

  if (error) {
    return { ok: false, error: `Falha no upload: ${error.message}` };
  }

  const { data } = supabase.storage.from(MEDAL_BUCKET).getPublicUrl(path);
  return { ok: true, url: data.publicUrl, path };
}

/**
 * Removes artwork that is no longer referenced. Failures are swallowed on
 * purpose: an orphaned object is untidy, but it must not fail the write that the
 * admin actually asked for.
 */
export async function deleteMedalImage(url: string | null): Promise<void> {
  const path = storagePathFromUrl(url);
  if (!path) return;

  try {
    await createSupabaseAdminClient().storage.from(MEDAL_BUCKET).remove([path]);
  } catch {
    // ignored, see above
  }
}

/**
 * Object path out of a public URL, or null when the URL is not ours (medals
 * seeded with an external link, for instance).
 */
export function storagePathFromUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${MEDAL_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  const path = url.slice(index + marker.length);
  return path.length > 0 ? decodeURIComponent(path) : null;
}
