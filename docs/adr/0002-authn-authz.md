# ADR-0002: Authentication with Supabase Auth; authorization via tenant memberships, permission sets, RLS and server checks

- Status: Proposed (Phase 0)
- Date: 2026-10-11

## Context
The four roles are platform admin, hostel admin, staff and student. Users may belong to several tenants. Revoking staff access must take effect immediately. The anon key is public, so the database must enforce authorization itself.

## Decision
- **Authentication:** Supabase Auth via `@supabase/ssr` cookies.
  - Staff/admin: email + password, with **TOTP MFA required** for hostel admins and platform admins.
  - Students: **email OTP code** (6 digits typed into the page, no magic-link redirect), with an optional password later.
  - Phone OTP is deferred: SMS cost, and the provider is undecided.
- **Authorization data:**
  - `platform_admins` table.
  - `tenant_memberships (tenant_id, user_id, role, permission_set_id, status)` for staff.
  - `residents (tenant_id, user_id)` for students.
  - Permissions come from a fixed catalog (RBAC_MATRIX §2), grouped into per-tenant permission sets.
- **Enforcement:**
  - Server-side `requirePermission()` gives early failure and correct HTTP semantics.
  - **Database RLS + RPC checks are authoritative**, including the MFA requirement for hostel and platform admin accounts (migration `20261122110000`).
- **No permissions in JWT custom claims for v1.** Helpers query membership tables, which are indexed and cached per statement. Revocation is immediate.

## Alternatives considered
- *JWT custom claims via an Auth hook:* faster policies, but stale until token refresh (up to 1 h) and more complex for multi-tenant users. Can be revisited for performance later.
- *A single global role per user:* fails for users who are staff at one hostel and a resident at another.
- *External auth (Clerk/Auth0):* adds cost and a second identity system that RLS would need to trust.

## Consequences
- Every RLS helper must be `STABLE`, `SECURITY DEFINER`, `search_path=''`, and backed by indexes.
- Platform admin access to tenant data goes through audited break-glass grants only.
- Supabase Auth production configuration (SMTP, rate limits, MFA, leaked-password protection) is a launch-checklist item.
