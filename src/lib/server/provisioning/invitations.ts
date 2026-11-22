import "server-only";
import { getServiceRoleClient } from "@/lib/server/supabase/admin";

/**
 * Sends the Supabase invitation email (allow-listed service-role module). Call it only after the
 * caller's own session has created the invitation through an RPC, which is where permission is
 * decided. The link target comes from the "Invite user" email template and Site URL
 * (docs/DEPLOYMENT_AND_OPERATIONS.md §3a), never from this request's Host header.
 *
 * "existing" means the address already has a confirmed account: no email is sent and the
 * invitation is accepted at their next sign-in. Callers must word "sent" and "existing" the same
 * way, so a hostel cannot use invitations to discover who has an AdeStay account.
 */
export type InvitationDelivery = "sent" | "existing" | "failed";

export async function sendInvitationEmail(email: string): Promise<InvitationDelivery> {
  const { error } = await getServiceRoleClient().auth.admin.inviteUserByEmail(email);
  if (!error) return "sent";
  if (error.code === "email_exists" || error.code === "user_already_exists") return "existing";
  // Code only: auth error text can contain the address (T15).
  console.error("invitation email failed", { code: error.code, status: error.status });
  return "failed";
}
