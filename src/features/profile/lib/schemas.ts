// Validation for the edits a MEMBER makes to their own profile. On the server,
// because the client can be bypassed with a crafted POST.

import { z } from "zod";

/**
 * Longest bio we accept.
 *
 * 280 to match `longTextOptional` in the admin schemas, which already settled this
 * question for medal descriptions and criteria. One number for "a paragraph a human
 * wrote" is one number to remember.
 */
export const BIO_MAX_LENGTH = 280;

/**
 * Links are refused, and this is a SPEED BUMP rather than a filter.
 *
 * It catches the shape spam actually arrives in (`http://`, `https://`, `www.`) and
 * a bare `meusite.com` still gets through. That is accepted on purpose. The bio is
 * rendered as text and React escapes it, so the risk here is not injection: it is a
 * public free-text field in a clan that recruits every week. A pattern strict enough
 * to catch every domain would start rejecting ordinary sentences, and a member who
 * cannot say what they mean writes nothing at all.
 */
const LINK_PATTERN = /(https?:\/\/|www\.)/i;

export const bioSchema = z.object({
  bio: z
    .string()
    .trim()
    .max(BIO_MAX_LENGTH, `Use no máximo ${BIO_MAX_LENGTH} caracteres`)
    .refine((value) => !LINK_PATTERN.test(value), {
      message: "Links não são permitidos na bio",
    })
    /**
     * Empty reaches Prisma as null instead of `""`, same rule as the admin's
     * optional fields: `""` satisfies a `not: null` filter, so an empty string is
     * a bio that EXISTS and says nothing. Clearing the field has to mean removing
     * it, or the public profile renders an empty box.
     */
    .transform((value) => (value ? value : null)),
});

export type BioInput = z.input<typeof bioSchema>;
