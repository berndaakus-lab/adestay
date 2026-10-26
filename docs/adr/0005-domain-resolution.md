# ADR-0005: Domain resolution, tenant from verified Host, staff on a single app domain

- Status: Proposed (Phase 0), pending D-1 and D-20
- Date: 2026-10-11

## Context
Each hostel needs its own branded site on a subdomain or custom domain. Staff may manage several hostels. Supabase Auth redirect URLs and cookies are host-specific.

## Decision
1. **Hosts:**
   - `{slug}.{platform-domain}`: always available (wildcard domain on Vercel).
   - Custom domain (e.g. `book.hostel.com.gh`): optional, added via the Vercel Domains API and served only after verification.
   - `app.{platform-domain}`: staff workspace (`/t/{tenantSlug}/…`) and platform admin (`/platform/…`).
2. **Resolution:**
   1. Middleware normalises the Host (lowercase, strip port) and **removes any inbound `x-tenant-*` headers**.
   2. It looks the host up via `app.resolve_tenant_by_host()`, which returns only verified domains of non-archived tenants, cached about 60 s.
   3. It sets an internal header.
   4. Server code re-resolves through a request-scoped cached function, so it never trusts the header alone for anything private.
3. **Tenant context ≠ authorization:** the host only selects which public content to show. Private data requires membership/ownership through RLS.
4. **Student auth on tenant domains** uses OTP codes typed into the page, so no per-domain redirect URL is needed. Password-reset links for staff point only at `app.` (a single redirect allow-list entry).
5. **Suspended tenants:** the host resolves, but public pages render "temporarily unavailable" and authenticated staff access is denied by RLS helpers.

## Alternatives considered
- *Path-based tenants (`platform.com/alder-house`):* simpler, but fails the "own domain" requirement and weakens branding.
- *Admin on each tenant's custom domain:* requires managing auth redirects and cookies per domain and exposes admin login on many hosts.
- *Tenant id in the JWT:* breaks multi-tenant staff and becomes stale.

## Consequences
- The Vercel Pro plan and a scoped API token are required for custom domains.
- A domain removal step is part of tenant offboarding, to prevent dangling DNS takeover.
