import { describe, expect, it } from "vitest";
import { cedisToPesewas, formatGhs } from "@/lib/money";

describe("formatGhs", () => {
  it.each([
    [0, "GH₵ 0.00"],
    [5, "GH₵ 0.05"],
    [125_000, "GH₵ 1,250.00"],
    [700_000, "GH₵ 7,000.00"],
    [123_456_789, "GH₵ 1,234,567.89"],
    [-59_000, "-GH₵ 590.00"],
  ])("formats %d pesewas as %s", (pesewas, expected) => {
    expect(formatGhs(pesewas)).toBe(expected);
  });

  it("accepts bigint beyond Number.MAX_SAFE_INTEGER", () => {
    expect(formatGhs(BigInt("900719925474099100"))).toBe("GH₵ 9,007,199,254,740,991.00");
  });

  it("rejects fractional pesewas", () => {
    expect(() => formatGhs(10.5)).toThrow(RangeError);
  });
});

describe("cedisToPesewas", () => {
  it("converts and rounds float noise", () => {
    expect(cedisToPesewas(1250)).toBe(125_000);
    expect(cedisToPesewas(0.1 + 0.2)).toBe(30);
  });
});
