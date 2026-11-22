import type { Metadata } from "next";
import { Suspense } from "react";
import { InviteStaffForm, TeamList, type MemberRow, type PermissionSetRow } from "@/components/staff/team-forms";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionUser } from "@/lib/server/auth";
import { requireStaffPage } from "@/lib/server/staff-page";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";

export const metadata: Metadata = { title: "Team" };

async function Team({ params }: { params: PageProps<"/t/[tenantSlug]/settings/team">["params"] }) {
  const { tenantSlug } = await params;
  const access = await requireStaffPage(tenantSlug, "/settings/team", ["staff.manage"]);
  const user = await getSessionUser();
  const db = await createSupabaseServerClient();
  const [membersResult, setsResult] = await Promise.all([
    db
      .from("tenant_memberships")
      .select("id, user_id, role, status, permission_set_id, invited_email")
      .eq("tenant_id", access.tenantId)
      .in("status", ["invited", "active"])
      .order("created_at"),
    db.from("permission_sets").select("id, name, description, permissions, is_system").or(`tenant_id.eq.${access.tenantId},is_system.eq.true`).order("is_system", { ascending: false }).order("name"),
  ]);
  if (membersResult.error) throw new Error(`Could not load the team (${membersResult.error.code})`);
  if (setsResult.error) throw new Error(`Could not load permission sets (${setsResult.error.code})`);

  const rows = membersResult.data ?? [];
  const userIds = rows.map((row) => row.user_id).filter((id): id is string => Boolean(id));
  const names = new Map<string, string | null>();
  if (userIds.length) {
    const { data, error } = await db.from("user_profiles").select("id, display_name").in("id", userIds);
    if (error) throw new Error(`Could not load names (${error.code})`);
    for (const profile of data ?? []) names.set(profile.id, profile.display_name);
  }
  const members: MemberRow[] = rows.map((row) => ({
    id: row.id,
    name: (row.user_id ? names.get(row.user_id) : null) ?? row.invited_email ?? "Team member",
    email: row.invited_email,
    role: row.role as MemberRow["role"],
    status: row.status as MemberRow["status"],
    permission_set_id: row.permission_set_id,
    isYou: row.user_id === user?.id,
  }));
  const sets = (setsResult.data ?? []) as PermissionSetRow[];

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="team-heading" className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 md:p-6">
        <h2 id="team-heading" className="font-heading text-xl">
          Team members
        </h2>
        <TeamList tenantSlug={access.slug} members={members} sets={sets} />
      </section>
      <section aria-labelledby="invite-heading" className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 md:p-6">
        <h2 id="invite-heading" className="font-heading text-xl">
          Invite someone
        </h2>
        <InviteStaffForm tenantSlug={access.slug} sets={sets} />
      </section>
    </div>
  );
}

export default function TeamPage({ params }: PageProps<"/t/[tenantSlug]/settings/team">) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Team params={params} />
    </Suspense>
  );
}
