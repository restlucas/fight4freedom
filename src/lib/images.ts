// Image validation for admin uploads.
//
// The format is detected from the file's MAGIC BYTES, never from the browser's
// Content-Type or the filename: both are controlled by whoever uploads. SVG is
// rejected outright — it is a document that can execute script, and serving one
// from our own origin would be stored XSS with the visitor's session in reach.

export const MAX_IMAGE_BYTES = 1024 * 1024; // 1 MB, matching the bucket's limit

/** Formats an admin may upload. Everything is re-encoded to WebP on the way in. */
export type ImageKind = "png" | "jpeg" | "webp" | "avif";

export const IMAGE_MIME: Record<ImageKind, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
};

/** For the file input's `accept`. Convenience only — the bytes are what decide. */
export const ACCEPTED_IMAGE_ACCEPT = Object.values(IMAGE_MIME).join(",");

function matches(bytes: Uint8Array, offset: number, signature: number[]): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

function ascii(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0));
}

/** The real format of the bytes, or null when it is not an accepted image. */
export function detectImageKind(bytes: Uint8Array): ImageKind | null {
  if (matches(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }
  if (matches(bytes, 0, [0xff, 0xd8, 0xff])) return "jpeg";
  // RIFF....WEBP
  if (matches(bytes, 0, ascii("RIFF")) && matches(bytes, 8, ascii("WEBP"))) {
    return "webp";
  }
  // The ISOBMFF brand sits right after the 4-byte box size.
  if (matches(bytes, 4, ascii("ftypavif")) || matches(bytes, 4, ascii("ftypavis"))) {
    return "avif";
  }
  return null;
}

export type ImageValidation =
  | { ok: true; kind: ImageKind }
  | { ok: false; error: string };

export function validateImageBytes(bytes: Uint8Array): ImageValidation {
  if (bytes.byteLength === 0) {
    return { ok: false, error: "Arquivo vazio." };
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: `A imagem deve ter no máximo ${MAX_IMAGE_BYTES / 1024} KB.`,
    };
  }

  const kind = detectImageKind(bytes);
  if (!kind) {
    return {
      ok: false,
      // Deliberately does not say "we detected X": no need to teach a prober
      // what our sniffing sees.
      error: "Formato não aceito. Envie PNG, JPEG, WebP ou AVIF.",
    };
  }

  return { ok: true, kind };
}
