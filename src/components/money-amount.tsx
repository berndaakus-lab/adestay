import { formatGhs, type Pesewas } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Money in GH₵ with tabular figures so columns of amounts line up. */
export function MoneyAmount({ pesewas, className }: { pesewas: Pesewas; className?: string }) {
  return <span className={cn("tabular-nums", className)}>{formatGhs(pesewas)}</span>;
}
