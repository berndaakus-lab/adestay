import type { Metadata } from "next";
import Link from "next/link";
import { CreateTenantForm } from "@/components/platform/tenant-forms";

export const metadata: Metadata = { title: "Add a hostel" };

// The platform layout has already required MFA and a platform admin; the action checks again.
export default function NewHostelPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div>
        <Link href="/platform" className="text-sm text-primary underline decoration-brass underline-offset-4">
          Back to hostels
        </Link>
        <p className="eyebrow mt-6 mb-3">Onboarding</p>
        <h1 className="text-4xl">Add a hostel</h1>
        <p className="mt-2 text-muted-foreground">The hostel stays private until you activate it.</p>
      </div>
      <CreateTenantForm rootDomain={process.env.NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN || null} />
    </div>
  );
}
