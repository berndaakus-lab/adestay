import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  /** The next useful action, e.g. a button to add the first room. */
  action?: ReactNode;
  className?: string;
}

/** Shown when a list has no items: explains why and what to do next. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      {icon ? <div className="text-olive [&_svg]:size-7" aria-hidden="true">{icon}</div> : null}
      <h3 className="text-2xl text-foreground">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
