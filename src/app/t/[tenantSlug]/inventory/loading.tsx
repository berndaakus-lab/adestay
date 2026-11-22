import { Skeleton } from "@/components/ui/skeleton";

// The Suspense boundary for every inventory page, so navigation shows a skeleton straight away.
export default function InventoryLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
