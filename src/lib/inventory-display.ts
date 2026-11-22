/** Display helpers for inventory screens. Stay dates are calendar days, so no time zone is applied. */
export function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Postgres returns dateranges as [start,end): gives the first and last blocked day. */
export function parseDayRange(range: string): { start: string; end: string } | null {
  const match = /^([[(])(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})([\])])$/.exec(range);
  if (!match) return null;
  const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  return {
    start: match[1] === "(" ? shift(match[2], 1) : match[2],
    end: match[4] === ")" ? shift(match[3], -1) : match[3],
  };
}

export const PERIOD_KINDS = [
  { value: "academic_year", label: "Academic year" },
  { value: "semester", label: "Semester" },
  { value: "vacation", label: "Vacation" },
  { value: "short_stay", label: "Short stay" },
] as const;

export const PERIOD_STATUSES = [
  { value: "draft", label: "Draft (hidden)" },
  { value: "open", label: "Open for booking" },
  { value: "closed", label: "Closed" },
  { value: "archived", label: "Archived" },
] as const;

export const UNIT_STATUSES = [
  { value: "active", label: "Active" },
  { value: "maintenance", label: "In maintenance" },
  { value: "retired", label: "Retired" },
] as const;

export const GENDER_POLICIES = [
  { value: "any", label: "Any" },
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
] as const;

export const labelOf = (options: readonly { value: string; label: string }[], value: string) => options.find((o) => o.value === value)?.label ?? value;

export const unitTone = (status: string) => (status === "active" ? "success" : status === "maintenance" ? "warning" : "neutral") as "success" | "warning" | "neutral";
