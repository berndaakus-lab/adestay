/**
 * Money is stored as integer pesewas (1 GH₵ = 100 pesewas) and never as floats.
 * See docs/DATABASE_DESIGN.md §1.
 */
export type Pesewas = number | bigint;

const GROUPING = /\B(?=(\d{3})+(?!\d))/g;

function toBigInt(amount: Pesewas): bigint {
  if (typeof amount === "bigint") return amount;
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`Amount must be a whole number of pesewas, got ${amount}`);
  }
  return BigInt(amount);
}

/** Formats pesewas as "GH₵ 1,250.00" (negative: "-GH₵ 1,250.00"). */
export function formatGhs(amount: Pesewas): string {
  const value = toBigInt(amount);
  const negative = value < BigInt(0);
  const abs = negative ? -value : value;
  const hundred = BigInt(100);
  const cedis = (abs / hundred).toString().replace(GROUPING, ",");
  const pesewas = (abs % hundred).toString().padStart(2, "0");
  return `${negative ? "-" : ""}GH₵ ${cedis}.${pesewas}`;
}

/**
 * Parses a typed cedi amount ("1,250.50", "900") to pesewas without floating point.
 * Returns null for anything else, including more than two decimals.
 */
export function parseCedisToPesewas(input: string): number | null {
  const text = input.trim();
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.replaceAll(",", "").split(".");
  const pesewas = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  return pesewas <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(pesewas) : null;
}

/** Converts a whole-cedi amount (e.g. from a price list) to pesewas. */
export function cedisToPesewas(cedis: number): number {
  const pesewas = Math.round(cedis * 100);
  if (!Number.isSafeInteger(pesewas)) {
    throw new RangeError(`Amount out of range: ${cedis}`);
  }
  return pesewas;
}
