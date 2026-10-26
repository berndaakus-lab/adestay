# ADR-0001: Tenant isolation, a shared PostgreSQL database with `tenant_id` and RLS

- Status: Proposed (Phase 0)
- Date: 2026-10-11

## Context
The first customer has about 50 beds; the platform must grow to many independent hostels. Tenant data (students, payments) must be strictly isolated. There is one developer, and the budget is small.

## Options
1. **Shared database, shared schema, `tenant_id` on every row, Postgres RLS.**
2. Schema per tenant in one database.
3. Supabase project (database) per tenant.

## Decision
Option 1.

## Rationale
- Option 3 multiplies cost (one Supabase Pro project per tenant, roughly $25+/month each) and operations: N migrations, N auth configs, N backups. That is unjustifiable for small hostels and for one developer.
- Option 2 complicates migrations and Supabase tooling, and PostgREST exposes schemas statically.
- Option 1 is the standard Supabase multi-tenant pattern. Its risk (a policy bug) is controlled by mechanical rules and tests.

## Rules that make it safe
1. `tenant_id not null` on every tenant-owned table; `unique (tenant_id, id)`; **composite FKs** for every intra-tenant relationship, so cross-tenant references cannot exist.
2. `ENABLE` + `FORCE ROW LEVEL SECURITY` on every table in `public`; a CI check fails otherwise.
3. Policies use `app.has_permission(tenant_id, …)` / ownership helpers, never client-supplied tenant ids.
4. Workflow writes happen only through `SECURITY DEFINER` RPCs that derive `tenant_id` from the target rows.
5. The service-role client is restricted to an allow-list of modules (webhooks, cron, lookup, provisioning), enforced by a lint rule.
6. Every new table ships with pgTAP isolation tests (read and write, per role).

## Consequences
- Per-tenant export/restore needs scripts (DATABASE_DESIGN §7).
- A noisy tenant could affect others. This is acceptable at the expected scale; it can be revisited if one tenant exceeds about 20% of load.
- A future "dedicated database" tier for a large customer remains possible, because all access goes through the same RPC/RLS contracts.
