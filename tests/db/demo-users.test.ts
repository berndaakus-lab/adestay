import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { createMigratedDatabase, supabaseDir } from "./pglite";

// The dev script that links dashboard-created accounts to the demo hostels must run cleanly, twice.
it("link-demo-users.sql links accounts to roles and is safe to re-run", async () => {
  const db = await createMigratedDatabase();
  await db.exec(readFileSync(path.join(supabaseDir, "seed.sql"), "utf8"));
  await db.exec(`insert into auth.users (email) values
    ('owner@alderhouse.example'), ('frontdesk@alderhouse.example'), ('accounts@alderhouse.example'),
    ('owner@cedarcourt.example'), ('platform@adestay.example'), ('student@alderhouse.example');`);
  const script = readFileSync(path.join(supabaseDir, "dev", "link-demo-users.sql"), "utf8");
  await db.exec(script);
  await db.exec(script);

  const roles = await db.query<{ email: string; slug: string; role: string; set_key: string | null }>(`
    select u.email, t.slug::text as slug, m.role, ps.key as set_key
    from public.tenant_memberships m
    join auth.users u on u.id = m.user_id
    join public.tenants t on t.id = m.tenant_id
    left join public.permission_sets ps on ps.id = m.permission_set_id
    order by u.email`);
  expect(roles.rows).toEqual([
    { email: "accounts@alderhouse.example", slug: "alder-house", role: "staff", set_key: "accounts" },
    { email: "frontdesk@alderhouse.example", slug: "alder-house", role: "staff", set_key: "front_desk" },
    { email: "owner@alderhouse.example", slug: "alder-house", role: "hostel_admin", set_key: null },
    { email: "owner@cedarcourt.example", slug: "cedar-court", role: "hostel_admin", set_key: null },
  ]);
  const counts = await db.query<{ admins: number; residents: number }>(`
    select (select count(*)::int from public.platform_admins) as admins,
           (select count(*)::int from public.residents) as residents`);
  expect(counts.rows[0]).toEqual({ admins: 1, residents: 1 });
  await db.close();
});
