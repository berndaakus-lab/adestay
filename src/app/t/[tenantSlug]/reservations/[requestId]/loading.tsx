import { Skeleton } from "@/components/ui/skeleton";

export default function BookingReviewLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <Skeleton className="h-12 w-72" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
