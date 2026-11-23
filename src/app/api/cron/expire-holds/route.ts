import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/server/cron-auth";
import { runHoldExpiry } from "./job";

const noStore = { "cache-control": "no-store" };

/** Called by a scheduler with `Authorization: Bearer <CRON_SECRET>`. Returns counts only. */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  }
  try {
    const result = await runHoldExpiry();
    return NextResponse.json(result, { status: result.failed ? 500 : 200, headers: noStore });
  } catch (error) {
    console.error("hold expiry job failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Job failed" }, { status: 500, headers: noStore });
  }
}
