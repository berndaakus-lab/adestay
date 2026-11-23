import { describe, expect, it } from "vitest";
import { brandStyle } from "@/lib/brand-style";

describe("brandStyle", () => {
  it("maps valid brand colours to CSS variables", () => {
    expect(brandStyle("#7a1f3d", "#7A5E26")).toEqual({ "--primary": "#7a1f3d", "--forest": "#7a1f3d", "--site-accent": "#7A5E26" });
  });

  it("keeps the default design without colours", () => {
    expect(brandStyle(null, undefined)).toEqual({});
  });

  it.each(["red", "#fff", "#12345g", "#123456;background:url(x)", "url(https://example.com/x)", "var(--x)"])("ignores %s", (value) => {
    expect(brandStyle(value, value)).toEqual({});
  });
});
