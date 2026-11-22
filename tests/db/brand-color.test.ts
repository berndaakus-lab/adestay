import { expect, it } from "vitest";
import { isReadableBrandColor } from "@/lib/brand-color";
import { createMigratedDatabase } from "./pglite";

// The form validator and the database CHECK must agree, or a colour passes one and fails the other.
it("isReadableBrandColor matches app.brand_color_is_readable across the colour space", async () => {
  const db = await createMigratedDatabase();
  const colors: string[] = ["#234536", "#2f5d74", "#b69a61", "#68765a", "#767676", "#000000", "#ffffff", "#f7f5ef"];
  for (let r = 0; r <= 255; r += 51) {
    for (let g = 0; g <= 255; g += 17) {
      for (let b = 0; b <= 255; b += 51) {
        colors.push(`#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`);
      }
    }
  }
  // Greys step through the 4.5:1 threshold one value at a time.
  for (let v = 90; v <= 125; v += 1) {
    const hex = v.toString(16).padStart(2, "0");
    colors.push(`#${hex}${hex}${hex}`);
  }

  const { rows } = await db.query<{ hex: string; readable: boolean }>(
    "select hex, app.brand_color_is_readable(hex) as readable from unnest($1::text[]) as hex",
    [colors],
  );
  await db.close();

  expect(rows).toHaveLength(colors.length);
  expect(rows.filter((row) => row.readable !== isReadableBrandColor(row.hex))).toEqual([]);
  expect(rows.some((row) => row.readable)).toBe(true);
  expect(rows.some((row) => !row.readable)).toBe(true);
});
