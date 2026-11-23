import Image from "next/image";
import { cn } from "@/lib/utils";

/** A hostel photo that fills its positioned parent. Non-HTTPS sources are local test servers. */
export function SiteImage({ src, alt, sizes, priority = false, className }: { src: string; alt: string; sizes: string; priority?: boolean; className?: string }) {
  return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} unoptimized={!src.startsWith("https://")} className={cn("object-cover", className)} />;
}
