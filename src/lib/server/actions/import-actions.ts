"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { dbErrorMessage } from "@/lib/db-errors";
import { authorizeStaffAction } from "@/lib/server/staff-action";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";
import { refreshPublicSite } from "@/lib/server/tenant/public-cache";
import { MAX_IMPORT_BYTES, parseInventoryCsv, type ImportIssue } from "@/lib/validation/inventory-csv";

/**
 * CSV import of rooms and beds (Phase 2, task 9). Preview and import both receive the file and run
 * the same validation; the import never trusts an earlier preview, because the data may have changed.
 */
export interface ImportFormState {
  status: "idle" | "error" | "preview" | "imported";
  message?: string;
  errors?: ImportIssue[];
  errorCount?: number;
  rooms?: number;
  beds?: number;
  byType?: { room_type: string; rooms: number; beds: number }[];
}

interface ImportResult {
  ok: boolean;
  rooms: number;
  beds: number;
  by_type: { room_type: string; rooms: number; beds: number }[];
  error_count: number;
  errors: ImportIssue[];
}

const MAX_ERRORS_SHOWN = 50;

async function readCsv(file: FormDataEntryValue | null): Promise<{ text: string } | { message: string }> {
  if (!(file instanceof File) || file.size === 0) return { message: "Choose a CSV file." };
  if (file.size > MAX_IMPORT_BYTES) return { message: "The file is too large (200 KB at most)." };
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()) };
  } catch {
    return { message: 'The file is not UTF-8 text. In your spreadsheet choose "CSV UTF-8" when saving.' };
  }
}

async function runImport(tenantSlug: string, formData: FormData, dryRun: boolean): Promise<ImportFormState> {
  const access = await authorizeStaffAction(tenantSlug, "inventory.manage");
  if (!access) return { status: "error", message: "You do not have permission to do that." };

  const csv = await readCsv(formData.get("file"));
  if ("message" in csv) return { status: "error", message: csv.message };

  const parsed = parseInventoryCsv(csv.text);
  if (parsed.errors.length) {
    return {
      status: "error",
      message: "Nothing was imported. Fix these rows and try again.",
      errors: parsed.errors.slice(0, MAX_ERRORS_SHOWN),
      errorCount: parsed.errors.length,
    };
  }

  const db = await createSupabaseServerClient();
  const { data, error } = await db.rpc("import_inventory", { p_tenant_id: access.tenantId, p_rows: parsed.rows, p_dry_run: dryRun });
  if (error) {
    const message = dbErrorMessage(error, {
      duplicate: "Some rooms were added while this import ran. Nothing was imported. Preview the file again.",
      rule: "A room would have more beds than its room type allows. Nothing was imported.",
      invalid: "The file could not be imported. Check it and try again.",
    });
    if (message) return { status: "error", message };
    const reference = randomUUID().slice(0, 8);
    console.error("inventory import failed", { reference, code: error.code });
    return { status: "error", message: `Nothing was imported. Try again, or quote reference ${reference}.` };
  }

  const result = data as ImportResult;
  if (!result.ok) {
    return {
      status: "error",
      message: "Nothing was imported. Fix these rows and try again.",
      errors: result.errors,
      errorCount: result.error_count,
    };
  }
  const summary = { rooms: result.rooms, beds: result.beds, byType: result.by_type };
  if (dryRun) return { status: "preview", message: `Ready to add ${result.rooms} rooms and ${result.beds} beds.`, ...summary };

  revalidatePath(`/t/${tenantSlug}`, "layout");
  refreshPublicSite(access.tenantId);
  return { status: "imported", message: `Added ${result.rooms} rooms and ${result.beds} beds.`, ...summary };
}

export async function previewInventoryImport(tenantSlug: string, _prev: ImportFormState, formData: FormData): Promise<ImportFormState> {
  return runImport(tenantSlug, formData, true);
}

export async function commitInventoryImport(tenantSlug: string, _prev: ImportFormState, formData: FormData): Promise<ImportFormState> {
  return runImport(tenantSlug, formData, false);
}
