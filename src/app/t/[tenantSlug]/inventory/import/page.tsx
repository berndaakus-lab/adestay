import type { Metadata } from "next";
import { InventoryImportForm } from "@/components/staff/inventory/import-form";
import { requireStaffPage } from "@/lib/server/staff-page";

export const metadata: Metadata = { title: "Import rooms" };

export default async function ImportPage({ params }: PageProps<"/t/[tenantSlug]/inventory/import">) {
  const { tenantSlug } = await params;
  const access = await requireStaffPage(tenantSlug, "/inventory/import", ["inventory.manage"]);
  return (
    <>
      <h2 className="font-heading text-xl">Import rooms and beds</h2>
      <InventoryImportForm tenantSlug={access.slug} />
    </>
  );
}
