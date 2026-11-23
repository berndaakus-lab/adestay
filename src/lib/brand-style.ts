import type { CSSProperties } from "react";

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * A hostel's brand colours as CSS variables (UI_UX_DESIGN_SYSTEM §2). The database only stores
 * colours readable with white text; the pattern check stops anything else reaching a style.
 */
export function brandStyle(primary: string | null | undefined, accent: string | null | undefined): CSSProperties {
  const style: Record<string, string> = {};
  if (primary && HEX.test(primary)) {
    style["--primary"] = primary;
    style["--forest"] = primary;
  }
  if (accent && HEX.test(accent)) style["--site-accent"] = accent;
  return style as CSSProperties;
}
