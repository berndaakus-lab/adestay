import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Reads the real token values from globals.css so the test can never drift from the stylesheet.
function readTokens(): Record<string, string> {
  const css = readFileSync(path.resolve(__dirname, "../../src/app/globals.css"), "utf8");
  const root = css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const tokens: Record<string, string> = {};
  for (const [, name, value] of root.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[name] = value.toLowerCase();
  }
  return tokens;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const tokens = readTokens();

// [text or UI colour, background colour, minimum ratio]
// 4.5 = WCAG AA normal text; 3 = WCAG 1.4.11 non-text (control borders, focus ring).
const pairs: Array<[string, string, number]> = [
  ["foreground", "background", 4.5],
  ["card-foreground", "card", 4.5],
  ["popover-foreground", "popover", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["secondary-foreground", "secondary", 4.5],
  ["accent-foreground", "accent", 4.5],
  ["muted-foreground", "muted", 4.5],
  ["muted-foreground", "background", 4.5],
  ["muted-foreground", "card", 4.5],
  ["olive-text", "background", 4.5],
  ["olive-text", "card", 4.5],
  ["forest", "background", 4.5],
  ["destructive", "background", 4.5],
  ["destructive", "card", 4.5],
  ["success", "success-bg", 4.5],
  ["warning", "warning-bg", 4.5],
  ["danger", "danger-bg", 4.5],
  ["info", "info-bg", 4.5],
  ["sidebar-foreground", "sidebar", 4.5],
  ["sidebar-accent-foreground", "sidebar-accent", 4.5],
  ["input", "card", 3],
  ["input", "background", 3],
  ["ring", "background", 3],
  ["ring", "card", 3],
];

describe("design token contrast (WCAG AA)", () => {
  it("finds the tokens in globals.css", () => {
    expect(Object.keys(tokens).length).toBeGreaterThan(30);
  });

  it.each(pairs)("%s on %s is at least %d:1", (fg, bg, min) => {
    expect(tokens[fg], `missing --${fg}`).toBeDefined();
    expect(tokens[bg], `missing --${bg}`).toBeDefined();
    expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(min);
  });

  it("documents that brass is decorative only (fails text contrast)", () => {
    expect(contrast(tokens.brass, tokens.background)).toBeLessThan(3);
  });
});
