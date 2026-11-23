import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * A hostel photo that fills its positioned parent. `priority` is for the main photo of a page: it
 * loads first instead of queueing behind the scripts. Non-HTTPS sources are local test servers.
 */
export function SiteImage({ src, alt, sizes, priority = false, className }: { src: string; alt: string; sizes: string; priority?: boolean; className?: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      preload={priority}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      unoptimized={!src.startsWith("https://")}
      className={cn("object-cover", className)}
    />
  );
}
