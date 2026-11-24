import type { ReactNode } from "react";

/**
 * The two internal site modes (src/lib/hosts.ts, INTERNAL_SITE_PREFIX). Listing them lets Next.js
 * store each hostel page as a finished page after its first visit: a parameter can only be
 * upgraded that way when the parameters above it are known.
 */
export function generateStaticParams() {
  return [{ mode: "live" }, { mode: "preview" }];
}

export default function SiteModeLayout({ children }: { children: ReactNode }) {
  return children;
}
