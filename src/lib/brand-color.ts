import { z } from "zod";

/**
 * Brand colour rule (docs/UI_UX_DESIGN_SYSTEM.md §2, Phase 2 acceptance criterion 3): at least 4.5:1
 * under white text AND as text on the ivory page. Must match app.brand_color_is_readable in
 * supabase/migrations; tests/db/brand-color.test.ts compares the two.
 */
export const BRAND_MIN_CONTRAST = 4.5;
const WHITE = "#ffffff";
const IVORY = "#f7f5ef";
const HEX = /^#[0-9a-f]{6}$/;

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/** Dark enough for both uses. Lighter colours fail even when they contrast with something else. */
export function isReadableBrandColor(hex: string): boolean {
  if (!HEX.test(hex)) return false;
  const lum = luminance(hex);
  return (
    (luminance(WHITE) + 0.05) / (lum + 0.05) >= BRAND_MIN_CONTRAST &&
    (luminance(IVORY) + 0.05) / (lum + 0.05) >= BRAND_MIN_CONTRAST
  );
}

/** Optional form field: empty means "use the platform default" (null). */
export const brandColorSchema = z
  .string()
  .trim()
  .toLowerCase()
  .default("")
  .refine((v) => v === "" || HEX.test(v), "Enter a colour like #234536")
  .refine((v) => v === "" || !HEX.test(v) || isReadableBrandColor(v), "This colour is too light to read. Choose a darker one.")
  .transform((v) => (v === "" ? null : v));
