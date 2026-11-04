import { notFound } from "next/navigation";

// Target of the proxy's rewrite for hosts that are not a live hostel domain. notFound() gives a
// real 404; the message comes from ./not-found.tsx.
export default function HostelNotFoundPage(): never {
  notFound();
}
