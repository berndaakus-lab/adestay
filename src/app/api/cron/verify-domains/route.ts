import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/server/cron-auth";
import { runDomainVerification } from "./job";

const noStore = { "cache-control": "no-store" };

/** Called by a scheduler with `Authorization: Bearer <CRON_SECRET>`. Returns counts only. */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  }
  try {
    return NextResponse.json(await runDomainVerification(), { headers: noStore });
  } catch (error) {
    console.error("domain verification job failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Job failed" }, { status: 500, headers: noStore });
  }
}
