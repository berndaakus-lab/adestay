import { formatGhs, type Pesewas } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Money in GH₵ with tabular figures so columns of amounts line up. The ₵ uses the device's font:
 * Inter keeps it in a separate 84 KB file that phones would otherwise download for one character.
 */
export function MoneyAmount({ pesewas, className }: { pesewas: Pesewas; className?: string }) {
  const [before, after] = formatGhs(pesewas).split("₵");
  return (
    <span className={cn("tabular-nums", className)}>
      {before}
      <span style={{ fontFamily: "system-ui, sans-serif" }}>₵</span>
      {after}
    </span>
  );
}
