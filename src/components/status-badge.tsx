import { Badge } from "@/components/ui/badge";
import type { StatusStyle } from "@/lib/status";

/** Renders a workflow state using the shared label/tone maps in src/lib/status.ts. */
export function StatusBadge({ status, className }: { status: StatusStyle; className?: string }) {
  return (
    <Badge variant={status.tone} className={className}>
      {status.label}
    </Badge>
  );
}
