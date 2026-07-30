/**
 * Progressive mask for a Brazilian phone number: `(11) 99999-9999`.
 *
 * PROGRESSIVE, not applied on blur, so the field reads as a phone number from the third
 * digit onward instead of rearranging itself once the person looks away.
 *
 * Handles BOTH lengths, because both exist and rejecting one would lose a candidate over
 * a formatting rule: eleven digits split 5-4 (mobile, with the 9), ten split 4-4
 * (landline). The split only moves once the eleventh digit arrives, so a landline never
 * flickers through a mobile layout while being typed.
 *
 * Digits beyond eleven are dropped rather than appended: a longer string is a paste of
 * something with a country code, and silently keeping it produces a number nobody can
 * dial. The `+55` case is handled the same way — the mask keeps the last eleven meaningful
 * digits a person typed, and an admin reading the field can always ask.
 */
export function formatWhatsapp(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;

  const area = digits.slice(0, 2);
  const rest = digits.slice(2);
  // 5-4 only once the ninth subscriber digit is actually there.
  const split = rest.length > 8 ? 5 : 4;

  if (rest.length <= split) return `(${area}) ${rest}`;
  return `(${area}) ${rest.slice(0, split)}-${rest.slice(split)}`;
}
