/** Display an E.164 Ghana number the way people write it: +233241234567 -> 024 123 4567. */
export function formatGhanaPhone(e164: string | null | undefined): string | null {
  if (!e164) return null;
  const m = /^\+233(\d{2})(\d{3})(\d{4})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}

/**
 * To E.164 (docs/DATABASE_DESIGN.md §1). Ghana numbers may be typed 024 123 4567, 233241234567 or
 * +233 24 123 4567; other countries need the leading +. Returns null when it is not a phone number.
 */
export function normalizePhone(input: string): string | null {
  const text = input.trim().replace(/[\s().-]/g, "");
  if (/^0\d{9}$/.test(text)) return `+233${text.slice(1)}`;
  if (/^233\d{9}$/.test(text)) return `+${text}`;
  if (text.startsWith("+233")) return /^\+233\d{9}$/.test(text) ? text : null;
  return /^\+[1-9]\d{7,14}$/.test(text) ? text : null;
}

/** wa.me link for a WhatsApp number in E.164. */
export function whatsappLink(e164: string): string {
  return `https://wa.me/${e164.replace(/^\+/, "")}`;
}
