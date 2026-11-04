import { notFound } from "next/navigation";

// Target of the proxy's 404 rewrites (wrong-surface paths). Raising notFound() makes Next.js send
// a real, uncached 404 with the app's not-found page (a rewrite's own status is not kept).
export default function NotFoundPage(): never {
  notFound();
}
