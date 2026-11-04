/** Display an E.164 Ghana number the way people write it: +233241234567 -> 024 123 4567. */
export function formatGhanaPhone(e164: string | null | undefined): string | null {
  if (!e164) return null;
  const m = /^\+233(\d{2})(\d{3})(\d{4})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}

/** wa.me link for a WhatsApp number in E.164. */
export function whatsappLink(e164: string): string {
  return `https://wa.me/${e164.replace(/^\+/, "")}`;
}
