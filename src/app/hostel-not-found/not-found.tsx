import { StatePage } from "@/components/states";

export default function HostelNotFound() {
  return (
    <StatePage eyebrow="404" title="This hostel website is not available">
      <p>
        The address is not linked to a hostel on AdeStay, or the hostel&apos;s website is not live yet. Check the
        address, or contact the hostel directly.
      </p>
    </StatePage>
  );
}
