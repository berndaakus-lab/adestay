# Implementation Checklist

> The single source of truth for progress. Update it at the end of every task. A test counts as **passed** only if it was executed and the result is recorded here.
>
> Status legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked

## Phase approval status

| Phase | Status | Approved by / date |
|---|---|---|
| 0: Architecture & Planning | **Approved** | Product owner, in chat, 2026-10-26 |
| 1: Foundation & Security | **Complete; accepted by the product owner with open hosted items carried into Phase 2 (see "Open before Phase 1 sign-off")** | Approved to start 2026-10-26; accepted 2026-11-14 (product owner, in chat) |
| 2: Tenant setup & Administration | **In progress** (task breakdown and decisions approved 2026-11-14) | Product owner, in chat, 2026-11-14 |
| 3: Public sites & Booking | Not started | — |
| 4: Student portal & Allocation | Not started | — |
| 5a: Invoices & manual payments | Not started (split approved 2026-10-26) | — |
| 5b: Gateway integration | Not started (split approved 2026-10-26) | — |
| 6: Notifications, Reports, Operations | Not started | — |
| 7: Security review & Launch | Not started | — |

## Phase 0: Architecture & Planning (2026-10-11)

### Tasks
- [x] Inspect the session workspace: empty, no project.
- [x] Locate the Figma project on disk: `C:\Users\User\Downloads\HMS - Berndaakus` (Figma Make export; Vite + React 19 + Tailwind v4; single `App.tsx` mock; no backend).
- [x] Create the repository `C:\Users\User\hostel-platform` (git initialised, no commits yet) with the product owner's approval.
- [x] Copy the Figma Make export unchanged to `design-reference/figma-make/`. The original was left untouched.
- [x] Light research on Paystack/Hubtel webhook and verify behaviour (fees **not** confirmed; see ADR-0004).
- [x] `docs/PRODUCT_REQUIREMENTS.md`
- [x] `docs/SYSTEM_ARCHITECTURE.md`
- [x] `docs/DATABASE_DESIGN.md`
- [x] `docs/RBAC_MATRIX.md`
- [x] `docs/SECURITY_THREAT_MODEL.md`
- [x] `docs/BOOKING_AND_PAYMENT_FLOWS.md`
- [x] `docs/UI_UX_DESIGN_SYSTEM.md` (contrast ratios computed with a script)
- [x] `docs/DEPLOYMENT_AND_OPERATIONS.md`
- [x] `docs/IMPLEMENTATION_PLAN.md`
- [x] `docs/IMPLEMENTATION_CHECKLIST.md`
- [x] ADRs 0001–0006 in `docs/adr/`
- [x] Root `README.md`, `CLAUDE.md` (session-resume instructions) and `.gitignore` (blocks `.env*`)
- [!] Figma design **file** review: blocked until the product owner shares the link.

### Tests
None. This phase is documentation only. No application code, migrations or dependencies were added. Nothing was installed or built.

### Decisions recorded (product owner, in chat, 2026-10-26)
| ID | Decision |
|---|---|
| D-1 | Platform name **AdeStay**. Root domain decided later (placeholder used until first deployment). |
| D-2 | Students verify their email with a 6-digit code before submitting a booking request. |
| D-18 | Code hosted in a **private GitHub repo** (`berndaakus-lab/adestay`). |
| D-19 | Phase 5 split into 5a (invoices + offline payments) and 5b (online gateway). |
| D-20 | Staff and platform admin on shared `app.<domain>`; student portal on each hostel's domain. |
| Student sign-in | Email OTP code (SMS can be added later). |
| Branches | `main` = production, `staging` = development testing; development is pushed directly to `staging`; the product owner merges `staging` into `main`. (Task 1 reached `staging` via PR #1.) |
| Vercel | Product owner connects and configures Vercel personally. |
| Dev database | **Hosted Supabase dev project** (no local Docker). The product owner creates it and puts keys in `.env.local`; keys are never pasted into chat. |

### Also produced in Phase 0
- Client proposal for the first hostel (kept outside the code history; `proposals/` is gitignored).

## Phase 1: Foundation & Security (started 2026-10-26)

### Tasks
- [x] 1. Scaffold Next.js (App Router, TS strict), Tailwind v4, shadcn/ui, ESLint, Vitest, Playwright (2026-10-26)
- [x] 2. Modern Residence design tokens, fonts and base components; component gallery page (2026-10-26)
- [x] 3. Supabase project link + first migrations (tenancy, memberships, residents, permissions, audit log) + seed data — done (2026-10-26); applied to hosted dev by the product owner via SQL Editor (2026-10-26)
- [x] 4. RLS policies, helper functions and pgTAP tenant-isolation tests — done and passing locally (2026-10-26); applied to hosted dev 2026-10-26
- [x] 5. Host → tenant resolution middleware, `getTenantContext`, `requirePermission`, service-role allow-list lint rule — done (2026-10-26); migration `20261026160000` to be applied to hosted dev
- [x] 6. Auth: staff email + password with TOTP MFA for admins; student email OTP — done (2026-11-04). Hosted on staging: staff password sign-in and admin TOTP setup + verification confirmed by the product owner; student email-code sign-in to be confirmed via the staging hostel preview (task 7)
- [x] 7. Public, staff and platform shells; 404 / 403 / suspended pages — done locally (2026-11-04); migration `20261104120000` to be applied; staging preview needs product-owner approval (see task 7 notes)
- [x] 8. GitHub Actions CI and `.env.example` — done (2026-11-10)

### Blockers / needs from product owner
- [x] Hosted Supabase dev project created; keys are in Vercel environment variables (product owner, 2026-10-26).
- [ ] **Apply migrations to the hosted dev project** the same way as ugs-kitchen-v2 (product owner decision, 2026-10-26): `npm run db:bundle` writes `supabase/.temp/apply-all.sql` (all migrations + dev seed, gitignored); the product owner pastes it into the Supabase SQL Editor and runs it once. Later migrations: `npm run db:bundle -- --since <last applied timestamp> --no-seed`. Record the last applied migration here after each run.
- Last migration applied to hosted dev: **`20261114120000_add_staff_and_profile_admin.sql`** (product owner, SQL Editor, 2026-11-14, file with only that migration; applied without errors). Before that, confirmed 2026-11-14 with a catalog query: 20261104100000, 20261104120000, 20261114100000 (complete) and 20261114110000 present; 20261114120000 absent). A re-run of a bundle that included 20261114110000 failed with 42723 "function room_type_capacity already exists" and changed nothing. **Next bundle: `npm run db:bundle -- --since 20261114120000 --no-seed`.** Earlier: `20261026160000_add_server_access_rpcs.sql` (inferred 2026-11-04). Before that: `20261026150000_add_authorization_helpers_and_rls.sql` (product owner, SQL Editor, 2026-10-26; check `residents_select` policy exists → true). Earlier: migrations 20261026130000-130300 + dev seed. `postgres` bypasses RLS: confirmed true.
- [ ] For local runs of the app against the hosted project (from task 5): `vercel env pull .env.local` or create `.env.local` manually.
- [ ] **Task 6 hosted setup (product owner, Supabase dashboard)** — see DEPLOYMENT_AND_OPERATIONS §3a: URL configuration (Site URL + `/auth/callback` redirect URLs), minimum password length 12, TOTP MFA enabled, Magic Link email template shows `{{ .Token }}`, OTP expiry 600 s. Then apply migrations `20261026160000` and `20261104100000`, create demo accounts and run `supabase/dev/link-demo-users.sql`.
- [ ] **D-9 email provider** needed before students outside the Supabase team can receive codes: Supabase's built-in email only delivers to project team members and is heavily rate-limited.

### Test results
| Date | Task | Command | Result |
|---|---|---|---|
| 2026-10-26 | 1 | `npm run typecheck` (next typegen + tsc) | Passed |
| 2026-10-26 | 1 | `npm run lint` | Passed, 0 problems |
| 2026-10-26 | 1 | `npm test` (Vitest 5.0.5) | 2/2 passed |
| 2026-10-26 | 1 | `npm run build` (Next 16.4.3) | Succeeded |
| 2026-10-26 | 1 | `CI=1 npx playwright test` (desktop + mobile Chromium, production server) | 2/2 passed |

| 2026-10-26 | 2 | `npm run typecheck` | Passed |
| 2026-10-26 | 2 | `npm run lint` | Passed, 0 problems |
| 2026-10-26 | 2 | `npm test` (contrast, money, status, utils) | 44/44 passed |
| 2026-10-26 | 2 | `npm run build` | Succeeded (/, /design-system static) |
| 2026-10-26 | 2 | `CI=1 npx playwright test` (smoke + axe WCAG 2.2 AA, desktop + mobile) | 6/6 passed, after fixing 1 axe failure (scrollable table not keyboard-focusable on mobile) |

| 2026-10-26 | 3 | `npm run test:db` (migrations + seed in PGlite; pgTAP 001-004: 18 + 27 + 12 + 3 assertions) | 6/6 passed (60/60 pgTAP assertions) |
| 2026-10-26 | 3 | `npm test` (unit + db) | 50/50 passed |
| 2026-10-26 | 3 | `tests/db/bundle.test.ts` (SQL Editor bundle applies to an empty DB) | 1/1 passed |
| 2026-10-26 | 3 | `npm run typecheck`, `npm run lint`, `npm run build` | Passed / 0 problems / succeeded |
| 2026-10-26 | 3 | `CI=1 npx playwright test` | 6/6 passed |

| 2026-10-26 | 4 | `npm run test:db` (pgTAP 001-005: 23 + 27 + 12 + 3 + 52 assertions, + migrations, seed, bundle) | 8/8 passed (117/117 pgTAP assertions) |
| 2026-10-26 | 4 | Mutation check: `residents_select` replaced with `using (true)` | Isolation suite failed as expected (tests catch a broken policy) |
| 2026-10-26 | 4 | `npm test` (unit + db) | 52/52 passed |
| 2026-10-26 | 4 | `npm run typecheck`, `npm run lint`, `npm run build` | Passed / 0 problems / succeeded |
| 2026-10-26 | 4 | `CI=1 npx playwright test` | 6/6 passed |

| 2026-10-26 | 5 | `npm test` (unit 76 + db 9 files; pgTAP adds 006 with 12 assertions → 129 total) | 85/85 passed |
| 2026-10-26 | 5 | ESLint probe: file outside allow-list importing the service-role client and reading the key | 3 errors reported (rule works); probe deleted |
| 2026-10-26 | 5 | `npm run lint`, `npm run typecheck`, `npm run build` (proxy compiled) | 0 problems / passed / succeeded |
| 2026-10-26 | 5 | Live production server: app host 200; tenant host without Supabase env 503; spoofed `x-adestay-tenant-id` on app host ignored (200) | As expected |
| 2026-10-26 | 5 | `CI=1 npx playwright test` | 6/6 passed |

| 2026-11-04 | 6 | `npm test` (unit 113 + db 11 files incl. pgTAP 007 last-admin guard and demo-user script) | 124/124 passed |
| 2026-11-04 | 6 | `CI=1 npx playwright test` (smoke, axe on /, /design-system, /sign-in, /forgot-password; auth routing; open-redirect) | 18/18 passed |
| 2026-11-04 | 6 | `npm run lint`, `npm run typecheck`, `npm run build` (sign-in pages as partial prerender) | 0 problems / passed / succeeded |
| 2026-11-04 | 6 | Visual check: /sign-in with validation errors (desktop), /forgot-password (390 px mobile) | Matches design system |
| 2026-11-04 | 6 | **Hosted (Vercel staging + Supabase dev), product owner:** staff password sign-in → /account; account with no memberships, MFA not required ("Not used"), "Your hostels" empty via `my_memberships` | Passed — confirms Supabase connection, Vercel app-host fix and that migration `20261026160000` is applied |

| 2026-11-04 | 6 | **Hosted, product owner:** hostel admin sign-in forced TOTP setup; code accepted; workspace reached | Passed |
| 2026-11-04 | 7 | `npm test` (unit 118 + db 12 files incl. pgTAP 008 slug resolver) | All passed |
| 2026-11-04 | 7 | `CI=1 npx playwright test` (30 tests: 404 status + page, wrong-surface 404, staff/platform redirects, landing link, axe incl. 404 page) | 30/30 passed |
| 2026-11-04 | 7 | Live server: wrong-surface path → `404` + `cache-control: private, no-store`; `/hostel-not-found` → 404 with hostel message | As expected |
| 2026-11-04 | 7 | `npm run lint`, `npm run typecheck`, `npm run build` | 0 problems / passed / succeeded |

| 2026-11-10 | 8 | Full CI sequence locally: typecheck, lint, unit (118), db (12 files), build, bundle check, Playwright (30) | All passed |
| 2026-11-10 | 8 | Bundle check probes: planted `service_role` JWTs (2 shapes) detected; `anon` JWT allowed; real-key mode active when the key is set | As expected |
| 2026-11-10 | 8 | gitleaks 8.30.1 (checksum-verified) over full history | 17 commits, no leaks |
| 2026-11-10 | 8 | `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities (after moving `shadcn` to devDependencies) |

| 2026-11-11 | 8 | **GitHub Actions CI run 42926799246** on `staging` (checks, e2e, security) | All 3 jobs passed |
| 2026-11-11 | close | pgTAP 005 +1 assertion: break-glass grant visible in the tenant's audit log (criterion 5) | 12/12 db files passed (53 assertions in 005) |

### Phase 1 acceptance criteria (IMPLEMENTATION_PLAN §2)
| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | typecheck, lint, unit, pgTAP, e2e pass and are recorded | **Met** | Test results above; CI run 42926799246 green |
| 2 | Tenant A gets 0 rows / is denied on tenant B for every Phase 1 table; anon reads nothing private | **Met** (database level) | pgTAP 001 + 005, run as the `anon`/`authenticated` roles with JWT claims exactly as PostgREST does. Not yet repeated over HTTP against the hosted project |
| 3 | Spoofed Host / `x-tenant-id` do not change the tenant | **Met** | Unit tests (proxy strips headers; host alone decides); live server check (task 5) |
| 4 | No membership changes without `staff.manage`; no self-elevation; last admin cannot be removed | **Met** | pgTAP 002, 005 (no direct writes for API roles), 007 (last-admin trigger) |
| 5 | Platform admin aal1 denied, aal2 allowed; no residents without break-glass; grant appears in tenant audit log | **Met** | pgTAP 005, 006; hosted: admin TOTP verified on staging |
| 6 | CI fails if any public table lacks RLS | **Met** | pgTAP 001 in CI db job |
| 7 | Client bundle contains no service-role key (automated) | **Met** | `npm run check:bundle` in CI; planted-key probes detected |
| 8 | Lighthouse accessibility ≥ 95 on sign-in and public shell | **Partly met** | axe WCAG 2.2 AA scans (0 serious/critical) on sign-in, reset, landing, 404, design system; Lighthouse itself not run; public hostel shell not scanned (needs Supabase data) |

### Open before Phase 1 sign-off (product owner)
- [x] Apply migrations `20261104100000` and `20261104120000` on hosted dev (confirmed present 2026-11-14).
- [x] Decide on the staging hostel preview (`/sites/{slug}` outside production): **approved** by the product owner (in chat, 2026-11-14), kept until D-1; off in production.
- [ ] Student email-code sign-in on staging (via the preview) — needs the Magic Link template `{{ .Token }}` and an email on the Supabase team (D-9 for everyone else).
- [ ] Optional: GitHub branch protection on `main` requiring CI.

### Task 8 notes
- `.github/workflows/ci.yml`: jobs **checks**, **e2e** (reuses the build artifact) and **security**; triggers on push to `staging`, PRs into `staging`/`main`, manual dispatch; read-only token; concurrency cancels superseded runs. Actions pinned to current majors (checkout v7, setup-node v7, upload-artifact v7, download-artifact v8).
- Acceptance criterion 6 (CI fails if a public table lacks RLS): pgTAP 001 runs in the db job. Criterion 7 (no service-role key in the client bundle): `npm run check:bundle` runs after the build. The first bundle check used fixed base64 fragments and missed a planted token with a different byte alignment; replaced by decoding every JWT-shaped token.
- `shadcn` moved to devDependencies: it is a build-time CLI/CSS package; its transitive `deepmerge`/`minimatch` advisories (low/moderate) no longer appear in the production audit.
- `.env.example` lists every variable from DEPLOYMENT_AND_OPERATIONS §2 with empty values and comments (including `ADESTAY_TENANT_PREVIEW`).
- Recommended for the product owner (GitHub settings): require the CI checks to pass before merging into `main` (branch protection).

### Task 7 notes
- Database part: migration `20261104120000_add_resolve_tenant_by_slug.sql` (`public.resolve_tenant_by_slug`, public facts only, archived excluded); pgTAP 008 (5 assertions); function whitelist test updated.
- **Hostel sites have their own route tree:** the proxy rewrites a hostel domain internally to `/sites/{slug}/...` (visitors keep clean URLs). Pages call `getSiteTenant(slug)`, which on a hostel domain requires the host to resolve to that same slug, so the slug can never select another tenant. `/sites` typed on a hostel domain is a 404. Implements SYSTEM_ARCHITECTURE §3's `(tenant)` tree.
- **Staging preview of hostel sites — needs product-owner approval:** on the app host, `/sites/{slug}` works outside production (`VERCEL_ENV !== "production"`, can be forced off with `ADESTAY_TENANT_PREVIEW=off`) and shows a "Staging preview" banner. Purpose: test public sites and student email-code sign-in before a domain exists. Deviation from "tenant chosen by host only"; it selects public content only (authorization unchanged) and is off in production.
- Public site shell: header (hostel logo/name, Contact, Student portal), footer, home (hero from profile tagline/about, rooms section with an honest "listings on their way" empty state until Phases 2-3, contact + Ghana Post GPS + landmark directions, call and WhatsApp buttons). Suspended hostels show a "not taking bookings" notice; the student portal stays available (D-16).
- Student portal moved to `/sites/[slug]/portal` (sign-in + placeholder); student actions check the site, so they work on the hostel domain and in preview.
- Staff workspace `/t/[tenantSlug]`: sidebar from the Figma navigation filtered by permissions; unbuilt sections marked "Soon" (not dead links); mobile menu as a disclosure; switch hostel; sign out. Non-members get 404.
- Platform `/platform`: requires MFA + platform admin (404 otherwise); tenant directory through RLS (operational data only).
- `/account` is now the workspace chooser (one hostel → straight to its workspace).
- 404s: the proxy rewrites wrong-surface paths and unknown hosts to targets that raise `notFound()` (a rewrite's own status is not kept by Next.js), with `cache-control: private, no-store` so a host that later becomes a hostel domain is never served a cached 404. Styled 404, "hostel not found", 403 component, suspended notice and error page (shows only a reference id).
- Fixed: `createSupabaseServerClient` now reads cookies before env, so pages using it are never prerendered at build time.
- Not verifiable locally (no Supabase keys): staff shell, platform page and hostel site rendering with data — check on staging.

### Task 6 notes
- Database part: migration `20261104100000_protect_last_hostel_admin.sql` — trigger blocks revoking, demoting or deleting the last active hostel admin of a non-archived tenant (Phase 1 acceptance criterion 4); pgTAP 007 (8 assertions).
- Staff (app host): `/sign-in` (email + password, same error for unknown email or wrong password), `/forgot-password` (same answer whether or not the account exists), `/auth/callback` (PKCE `code` or `token_hash`), `/reset-password` (12-character minimum), `/mfa/setup` (TOTP QR + key), `/mfa/verify`, `/account` (temporary landing until task 7), `/account/continue` (applies MFA policy after sign-in).
- MFA policy (`src/lib/mfa-policy.ts`): hostel admins and platform-admin accounts must enrol and verify TOTP (aal2); other staff optional, but anyone with a verified factor must use it.
- Students (tenant host): `/portal/sign-in` (6-digit email code via `signInWithOtp` + `verifyOtp`, account created on first code), `/portal` placeholder (Phase 4).
- Proxy refreshes the Supabase session cookies (only when an auth cookie is present) and now also enforces which paths exist on which surface, so wrong-surface pages return a real 404 (with partial prerendering a later `notFound()` cannot change the status).
- **Bug fixed from task 5:** on Vercel the deployment hostname (`*.vercel.app`) was treated as an unknown tenant host, so every page returned 404 on staging. App hosts now include `NEXT_PUBLIC_APP_HOST` and Vercel's runtime `VERCEL_URL`, `VERCEL_BRANCH_URL` and `VERCEL_PROJECT_PRODUCTION_URL`.
- Next.js 16 `cacheComponents`: every cookie/header read sits inside `<Suspense>`; auth pages build as partial prerender.
- Open redirects: every `next` parameter passes `safeNextPath` (same-site paths only).
- OTP send rate limit (5/hour/email in SECURITY_THREAT_MODEL §5) currently relies on Supabase Auth's built-in limits; an app-level limit comes with the booking flow (Phase 3).
- Lighthouse is not installed; accessibility criterion 8 is covered by axe (WCAG 2.2 AA) scans of the sign-in and reset pages on desktop and mobile.
- `supabase/config.toml` (local CLI only) aligned: password minimum 12, TOTP on, OTP expiry 600 s, `/auth/callback` redirect.

### Task 5 notes
- Next.js 16 renamed `middleware.ts` to **`proxy.ts`** (`src/proxy.ts`, Node.js runtime). Docs that say "middleware" mean this file.
- Database part (DB → API → UI): migration `20261026160000_add_server_access_rpcs.sql` exposes `public.resolve_tenant_by_host`, `public.my_memberships` (effective permissions; admins get the full catalog) and `public.am_i_platform_admin` (aal2 only), because only the `public` schema is on the Data API. pgTAP 006 covers them.
- Proxy (`src/lib/server/tenant/proxy-handler.ts`): strips inbound `x-adestay-*` / `x-tenant-*` headers; app host (and localhost) → app surface; other hosts must resolve to a verified, non-onboarding tenant (else 404); forwards tenant id/slug/status as internal request headers only. 503 for tenant hosts when Supabase env is missing.
- `getTenantContext()` re-resolves the Host itself and ignores the proxy's hint headers (ADR-0005 rule 2.4); request-scoped via React `cache`.
- `requireTenantMember(slug)`, `requirePermission(access, perm, "read" | "action")` (404 for reads, 403 for actions), `requirePlatformAdmin()` in `src/lib/server/authz.ts`; memberships read per request (revocation immediate).
- Tenant resolver cache: 60 s for hits, 15 s for misses, max 1,000 hosts, per server instance.
- Service role: client in `src/lib/server/supabase/admin.ts` (`server-only`). `SERVICE_ROLE_ALLOWLIST` in `eslint.config.mjs` (webhooks, cron, booking lookup, provisioning) enforced by ESLint and by `tests/unit/service-role-allowlist.test.ts`.
- `src/lib/permissions.ts` mirrors the SQL permission catalog; a test fails if they drift.
- New env (optional until D-1): `NEXT_PUBLIC_APP_HOST` (defaults to `localhost`). Session refresh in the proxy comes with auth (task 6).
- Not testable on this machine without Supabase keys: tenant resolution against the hosted database. Can be checked on the Vercel staging deployment by adding its hostname as a verified tenant domain.

### Task 4 notes
- Helpers (`app`, STABLE SECURITY DEFINER, `search_path = ''`): `is_platform_admin` (requires aal2/MFA), `tenant_is_active`, `is_tenant_member`, `is_hostel_admin`, `has_permission`, `my_resident_id`, `has_break_glass`, `can_view_user_profile`, `resolve_tenant_by_host` (verified domains only; normalises case/port/trailing dot; returns status).
- Policies implement RBAC_MATRIX §4 for all 11 Phase 1 tables. Memberships, residents, audit logs and platform admins have **no direct write access** for API roles (RPC-only, Phase 2/3).
- Sensitive resident fields (gender, student ID number, emergency contacts) are protected with **column-level privileges** and read through `public.get_resident_sensitive(id)` (self, or `residents.read_sensitive`). This replaces the `residents_sensitive` view in DATABASE_DESIGN: a security-definer view would bypass RLS.
- Suspension: staff lose access immediately; students keep read access to their own record (D-16). Revocation is immediate (memberships read per query, not from JWT claims).
- Isolation suite (005) covers anon, outsider, hostel admins of two tenants, admin of a suspended tenant, front desk and accounts staff, two students, platform admin with and without MFA, active vs expired break-glass, cross-tenant update attempts, and revocation.
- "Last hostel admin cannot be removed" and "no self-role change" are enforced in the membership RPCs (Phase 2), since API roles cannot write memberships at all.
- Hosted dev check (product owner, 2026-10-26): `select rolbypassrls from pg_roles where rolname = 'postgres'` → **true**. SECURITY DEFINER helpers on forced-RLS tables work on Supabase without recursion.

### Task 3 notes
- Migrations (`supabase/migrations/`): extensions, `app`/`private` schemas and helpers; tenancy (tenants, tenant_domains, tenant_profiles, tenant_settings, platform_admins, platform_access_grants); people and access (user_profiles + auth trigger, permission_sets with the 4 system sets, tenant_memberships, residents); append-only audit_logs with redaction and automatic row-change auditing; `private.rate_limits` + `app.check_rate_limit`.
- Every public table: RLS **enabled and forced**, no policies yet, no anon/authenticated privileges (deny by default until task 4).
- **Local DB testing without Docker:** PGlite (Postgres 18 in WASM, `@electric-sql/pglite` + official `@electric-sql/pglite-pgtap`, dev-only) plus `supabase/tests/support/supabase_shim.sql` (stand-in for Supabase's auth schema and roles; never applied to a real project). The same pgTAP files run on the hosted project with `supabase test db`.
- **Security finding fixed during the task:** API roles could execute `app.*` helper functions because Postgres grants EXECUTE to PUBLIC by default and per-schema default privileges cannot remove that. Each migration now ends with `revoke execute on all functions in schema app from public`, and a pgTAP guard test fails if any app/private function becomes executable by anon or by authenticated beyond a whitelist.
- Doc inconsistency resolved: tenant_profiles updates use the catalog permission `settings.manage` (DATABASE_DESIGN mentioned `settings.branding`, which is not in the catalog).
- To verify on the hosted project: Supabase's `postgres` role bypasses RLS for the forced tables (needed by SECURITY DEFINER helpers and the seed); the `pgtap` extension is enabled before running `supabase test db`.
- Supabase targets Postgres 17; PGlite runs 18, so migrations avoid 18-only features.

### Task 2 notes
- Tokens live in `src/app/globals.css` (hex only); `tests/unit/contrast.test.ts` parses them and checks 24 colour pairs against WCAG AA.
- Accessibility adjustments vs the Phase 0 token table: `--warning` darkened to `#7a5a24`; inputs use `--line-strong` `#858a83` (3:1 for control borders); focus ring uses `--brass-strong` `#7a5e26` (brass `#b69a61` fails 3:1 and stays decorative).
- Controls are 44px tall (buttons, inputs, selects); corners 2px controls / 4px cards.
- Light-only design: `next-themes` removed; the toaster is fixed to light.
- Fonts: Inter + DM Serif Display, self-hosted by `next/font`.
- Shared helpers: `formatGhs` (pesewas → "GH₵ 1,250.00"), status label/tone maps for every workflow state.
- `/design-system` gallery returns 404 when `VERCEL_ENV=production`.
- Shared table container is keyboard-focusable so wide tables scroll on small screens.

### Task 1 notes
- Versions: Next 16.4.3, React 19.3.0, Tailwind v4, shadcn 4.22.1 (radix-nova preset, Lucide icons), Vitest 5.0.5, Playwright 1.64.
- shadcn's preset uses the `cn` package (published by shadcn, repo `shadcn-ui/cn`) instead of `clsx` + `tailwind-merge`.
- `npm run typecheck` runs `next typegen` first because Next 16 generates global route types (`LayoutProps`).
- Next 16 ships its own docs in `node_modules/next/dist/docs/`; `AGENTS.md` (managed by `next dev`) says to read them before writing app code.

## Phase 2: Tenant setup & Administration (started 2026-11-14)

Build order: database (migrations + RLS + pgTAP) → server (actions, RPCs, validation) → UI.

### Tasks
- [x] 1. Inventory tables: booking_periods, room_types, room_type_photos, rooms, beds, bed_blocks, room_type_prices; composite FKs, constraints, audit, RLS (staff + anon published content); pgTAP — done locally (2026-11-14); migration `20261114100000` applied on hosted dev (confirmed 2026-11-14)
- [x] 2. Sellable capacity per room type × period (active beds in active rooms minus overlapping blocks); pgTAP — done locally (2026-11-14); migration `20261114110000` applied on hosted dev (confirmed 2026-11-14)
- [x] 3. Admin RPCs: memberships (invite, change role, revoke; no self-change, no granting unheld permissions, last-admin guard), custom permission sets, profile/settings updates (brand colour contrast); pgTAP — done locally (2026-11-14); migration `20261114120000` applied on hosted dev (2026-11-14)
- [x] 4. Platform RPCs: create tenant (tenant, profile, settings, subdomain; onboarding → active), suspend/restore, domains; aal2; pgTAP — done locally (2026-11-14); migration `20261114130000` to be applied on hosted dev
- [x] 5. Storage bucket `tenant-public` + storage RLS (tenant folder, permission, MIME, size); PGlite storage shim — done locally (2026-11-19); migrations `20261119100000` and `20261122100000` to be applied on hosted dev
- [x] 6. Zod schemas + server actions for inventory and pricing; brand-colour contrast validator — done locally (2026-11-22); no migration
- [x] 7. Upload pipeline (server-only, `src/lib/server/uploads`): user-session permission check, magic bytes, no SVG, ≤ 5 MB, re-encode with `sharp` (EXIF stripped), server-generated paths, service-role upload; polyglot tests — done locally (2026-11-22); needs hosted migrations `20261119100000` and `20261122100000`
- [ ] 8. Provisioning module: tenant wizard action, first-admin invite; staff invite + accept flow
- [ ] 9. CSV import of rooms/beds: strict parser, dry-run preview, one-transaction RPC, ≤ 500 rows
- [ ] 10. Custom domains: Vercel Domains API client + verification cron; manual status fallback without a token
- [ ] 11. Platform UI: tenant wizard, tenant detail (status, domains, admin invite)
- [ ] 12. Hostel admin UI: profile/branding, settings, staff and permission sets
- [ ] 13. Inventory UI: periods, room types + photos, rooms/beds, blocks, prices, capacity table, CSV import
- [ ] 14. E2E + axe (desktop, 360 px), acceptance review

### Decisions (product owner, in chat, 2026-11-14: "Approve defaults")
| Decision | Outcome |
|---|---|
| Staging hostel preview `/sites/{slug}` | Approved; stays until D-1; off in production |
| CSV import of rooms/beds | In scope (task 9); hand-written strict parser (no new dependency), preview before commit, ≤ 500 rows |
| Custom domains | Product owner creates a scoped Vercel token and sets `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`; until then domain status is set manually in the platform UI |
| `sharp` | Approved as a direct dependency (EXIF stripping by re-encoding) |
| Invites | Supabase `inviteUserByEmail` from the allow-listed provisioning module; membership `invited` → `active` on first sign-in with that email. Needs D-9 for addresses outside the Supabase team |
| Room photos | Public `tenant-public` bucket (DATABASE_DESIGN §6); private bucket waits for Phase 5a |
| Upload path (2026-11-22) | **Server-only.** The product owner first chose the user session, then changed to server-only in chat the same day. API roles cannot insert into `tenant-public`; `src/lib/server/uploads/**` is added to `SERVICE_ROLE_ALLOWLIST` |
| D-9 email provider, D-1 root domain | Still open (Resend or Postmark recommended; D-1 needed for "subdomain live" in acceptance criterion 1) |

### Test results
| Date | Task | Command | Result |
|---|---|---|---|
| 2026-11-14 | 1 | `npm run test:db` (12 → 13 files; new pgTAP 009 with 54 assertions; 001 updated to 18 tables, anon read list and "anon writes nothing") | 13/13 passed |
| 2026-11-14 | 1 | Mutation check: `rooms_select` changed to `using (true or …)` | 009 failed 6 assertions as expected; migration restored |
| 2026-11-14 | 1 | `npm test` (unit + db) | 131/131 passed |
| 2026-11-14 | 1 | `npm run lint`, `npm run typecheck` | 0 problems / passed |
| 2026-11-14 | 1 | **GitHub Actions CI run 43641651223** on `staging` (commit `c0d9379`) | All 3 jobs passed |
| 2026-11-14 | 2 | `npm run test:db` (14 files; new pgTAP 010 with 24 assertions on a 50-bed hostel) | 14/14 passed |
| 2026-11-14 | 2 | Mutation checks: (a) released blocks counted as live; (b) permission check removed from `public.room_type_capacity` | (a) 2 assertions failed, (b) 5 failed, as expected; migration restored |
| 2026-11-14 | 2 | `npm test` (unit + db), `npm run lint`, `npm run typecheck` | 132/132 passed / 0 problems / passed |
| 2026-11-14 | 2 | **GitHub Actions CI run 43645173872** on `staging` (commit `f16ca60`) | Passed |
| 2026-11-14 | 3 | `npm run test:db` (15 files; new pgTAP 011 with 52 assertions; 001 whitelist adds `brand_color_is_readable`) | 15/15 passed |
| 2026-11-14 | 3 | Mutation checks: (a) "cannot change your own membership" guard removed; (b) confirmed-email requirement removed from `accept_my_invitations` | (a) admin demoted themselves and the file aborted at the next invite ("not allowed"); (b) 2 assertions failed; migration restored both times |
| 2026-11-14 | 3 | `npm test` (unit + db), `npm run lint`, `npm run typecheck` | 133/133 passed / 0 problems / passed |
| 2026-11-14 | 3 | **GitHub Actions CI run 43647640224** on `staging` (commit `800365d`) | Passed |
| 2026-11-14 | 3 | **Hosted dev, product owner:** SQL Editor, file with only `20261114120000` | Applied without errors |
| 2026-11-14 | 4 | `npm run test:db` (16 files; new pgTAP 012 with 50 assertions; 011 re-run against the refactored `invite_staff_member`) | 16/16 passed |
| 2026-11-14 | 4 | Mutation checks: (a) "custom domain cannot be under the platform domain" removed; (b) "no platform invite once an active admin exists" removed | (a) 2 assertions failed, (b) 1 failed, as expected; migration restored |
| 2026-11-14 | 4 | `npm test` (unit + db), `npm run lint`, `npm run typecheck` | 134/134 passed / 0 problems / passed |
| 2026-11-14 | 4 | **GitHub Actions CI run 43648925464** on `staging` (commit `b4f0b55`) | Passed |
| 2026-11-19 | 5 | `npm run test:db` (17 files; new pgTAP 013 with 25 assertions; 001 whitelist adds `can_manage_public_asset`) | 17/17 passed |
| 2026-11-19 | 5 | Mutation checks: (a) "room type belongs to this hostel" changed from `and` to `or`; (b) server-generated name check removed | (a) 5 assertions failed, (b) 4 failed, as expected; migration restored |
| 2026-11-19 | 5 | `npm test` (unit + db), `npm run lint`, `npm run typecheck` | 135/135 passed / 0 problems / passed |
| 2026-11-19 | 5 | **GitHub Actions CI run 44637236559** on `staging` (commit `c04fe80`) | Passed |
| 2026-11-22 | 5 (revised) | `npm run test:db` (pgTAP 013 now 30 assertions: permission check, no direct inserts, service role can write) | 17/17 passed |
| 2026-11-22 | 5 (revised) | Mutation check: old insert policy left in place | 3 assertions failed, as expected; migration restored |
| 2026-11-22 | 5 (revised) | `npm test` (unit + db), `npm run lint`, `npm run typecheck` | 135/135 passed / 0 problems / passed |
| 2026-11-22 | 5 (revised) | **GitHub Actions CI run 44994656670** on `staging` (commit `6967b55`) | Passed |
| 2026-11-22 | 6 | `npm test` (14 files: new validation and action tests; TS brand-colour rule compared with the SQL function across the colour space) | 209/209 passed |
| 2026-11-22 | 6 | Mutation checks on `runAction`: (a) permission check removed; (b) session + MFA check removed | 2 tests failed each, as expected; file restored |
| 2026-11-22 | 6 | PGlite probe: every column the actions write is granted to `authenticated`; update schema with id parses correctly | Passed (probe not kept) |
| 2026-11-22 | 6 | `npm run lint`, `npm run typecheck`, `npm run build` | 0 problems / passed / succeeded |
| 2026-11-22 | 6 | `npm audit --omit=dev --audit-level=high` | No high/critical; 1 **moderate** advisory group on `next` 16.0.0-16.4.4 (installed 16.4.3; fix in later 16.4.x) |
| 2026-11-22 | 6 | PGlite probe: active hostel admin with an **aal1** JWT inserts into `room_types` | **Write succeeded: open security finding, see task 6 notes** |
| 2026-11-22 | security | `next` and `eslint-config-next` upgraded 16.4.3 → 16.4.6: `npm audit --omit=dev` | 0 vulnerabilities (full `npm audit` still reports 10 moderate, all in dev dependencies; not changed here) |
| 2026-11-22 | security | After the upgrade: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run check:bundle`, `CI=1 npx playwright test` | passed / passed / 209/209 / succeeded / clean (22 files, 3 checks) / 30/30 |
| 2026-11-22 | 6 | **GitHub Actions CI run 44995493881** on `staging` (commit `c10dabb`) | Passed |
| 2026-11-22 | MFA fix | `npm test` (14 Vitest files incl. new pgTAP 014 with 30 assertions; 005 and 012 admin sessions now aal2) | 210/210 passed |
| 2026-11-22 | MFA fix | Mutation checks: (a) policy always true; (b) check removed from `has_permission` | (a) 16 assertions failed, (b) 11 failed, as expected; migration restored |
| 2026-11-22 | MFA fix | `npm run lint`, `npm run typecheck`, `CI=1 npx playwright test` | 0 problems / passed / 30/30 passed |
| 2026-11-22 | MFA fix | Rebased on `next` 16.4.6, then: `npm test`, lint, typecheck, `npm run build` (4 runs), `npm run check:bundle`, `CI=1 npx playwright test`, `npm audit --omit=dev` | 210/210 / 0 problems / passed / 4 of 4 succeeded / clean / 30/30 / 0 vulnerabilities. On 16.4.3, 2 of 4 builds had stopped with a Next.js `SecurityFatalError` upgrade notice |
| 2026-11-22 | MFA fix | **GitHub Actions CI run 44996918816** on `staging` (commit `7af9d89`) | Passed |
| 2026-11-22 | 7 | `npm test` (16 files; new image-processing tests with real `sharp` and upload-action tests: SVG, HTML, PDF, GIF, appended and JPEG-comment polyglots, truncated file, > 5 MB, decompression bomb, EXIF/GPS) | 251/251 passed |
| 2026-11-22 | 7 | Mutation checks: (a) file-type checks removed; (b) metadata kept; (c) database permission check removed | 3, 3 and 2 tests failed, as expected; files restored |
| 2026-11-22 | 7 | `npm run lint`, `npm run typecheck`, `npm run build` (2 runs), `npm run check:bundle`, `CI=1 npx playwright test`, `npm audit --omit=dev` | 0 problems / passed / 2 of 2 succeeded / clean / 30/30 / 0 vulnerabilities |

### Task 1 notes
- Migration `20261114100000_create_inventory_and_pricing.sql`. Every table: `tenant_id`, `unique (tenant_id, id)`, composite FKs to parents, RLS enabled and forced, `updated_at` and row-change audit triggers.
- Writes are single-row edits through RLS policies (DATABASE_DESIGN §3 exception for simple edits): `inventory.manage` for periods, room types, photos, rooms, beds, blocks; `pricing.manage` for prices. `tenant_id`, `id` and fixed parent keys (photo's room type, block's bed, price's type/period) are **not** in the UPDATE column grants, so rows cannot be moved to another hostel.
- Reads: anon (and everyone) see open/closed periods, published room types, their photos, and prices of published types in open periods, all only for active hostels. Every member reads periods, room types, photos and prices; rooms, beds and blocks need `inventory.read` or `inventory.manage`; break-glass gives read only. Suspended hostels: staff see nothing, public content disappears.
- Additions within the design (no change of intent): a room can never hold more non-retired beds than its room type's `occupancy` (trigger `app.enforce_room_occupancy`, locks the room row; also checked when a room changes type or occupancy is lowered); period names unique per hostel; price ≤ GH₵ 1,000,000 to catch unit mistakes; photo `storage_path` must sit in `{tenant_id}/room-types/{room_type_id}/`; `stay` is computed through a `CASE` so a backwards period reports a check violation (23514) rather than a range error.
- Bed blocks are never deleted (no DELETE grant): released by setting `released_at`; `created_by`/`released_by` come from the session; a released block is frozen. Overlapping live blocks on one bed are refused by the exclusion constraint (23P01).
- Delete behaviour: deleting a room type is refused while rooms use it; deleting a room removes its beds unless a bed has block history (refused). Later workflow tables will reference beds/periods with `restrict`.
- Hosted dev: first check which Phase 1 migrations are applied (`select to_regprocedure('app.protect_last_hostel_admin()') is not null as m_20261104100000, to_regprocedure('app.resolve_tenant_by_slug(text)') is not null as m_20261104120000;`). If both are true, paste `npm run db:bundle -- --since 20261104120000 --no-seed`; if both are false, `--since 20261026160000`. Record the result in "Last migration applied" above.

### Task 2 notes
- Migration `20261114110000_add_room_type_capacity.sql`. `app.room_type_capacity(tenant, period?)` is the single implementation (SECURITY DEFINER, **no API grants**) so the Phase 3 approval RPC can count every bed under its room-type lock. Staff call `public.room_type_capacity(tenant, period?)`, which returns rows only with `inventory.read`, `inventory.manage` or break-glass (no rows otherwise, consistent with "404 for reads"); not granted to anon, since exact counts are not public (D-4).
- Per room type × non-archived period: `total_beds` (non-retired beds in non-retired rooms), `out_of_service_beds` (bed or room in maintenance), `blocked_beds` (in service but a live block overlaps any day of the period), `sellable_beds`. A bed blocked for part of a period is not sellable for that period. Room types without rooms return zeros rather than no row.
- Acceptance criterion 2 (database part) covered by pgTAP 010: a 50-bed hostel with retired, maintenance, blocked, released-block and boundary-day cases. Live reservations are subtracted in Phase 3 (BOOKING_AND_PAYMENT_FLOWS §3 capacity rule); the UI capacity table comes in task 13.
- Hosted dev: same check as task 1; the bundle `--since 20261104120000 --no-seed` now contains both Phase 2 migrations.

### Task 3 notes
- Migration `20261114120000_add_staff_and_profile_admin.sql`.
- **Membership RPCs** (the only API write path; `tenant_memberships` has no write grants): `invite_staff_member(tenant, email, role, set)`, `accept_my_invitations()`, `change_member_role(membership, role, set)`, `revoke_membership(membership, reason)`. Each re-checks `staff.manage` on the row's own tenant, refuses the caller's own membership, lets only hostel admins create or change hostel admins, and refuses granting permissions the caller does not hold (moot in v1 since `staff.manage` is admin-only, but enforced). The Phase 1 trigger still blocks removing the last active admin. Errors: 42501 not allowed (also for unknown ids), 22023 invalid input, 23505 already member/invited.
- Invitations: email normalised to lower case; re-inviting a former member reopens their row; one open invite per address per hostel (tenant row locked). `accept_my_invitations` activates invites addressed to the caller's **confirmed** email (`auth.users.email_confirmed_at`) — the server calls it after sign-in (task 8). Sending the Supabase invitation email is task 8 (provisioning module). Invitations do not expire (not in the design); can be cancelled with `revoke_membership`.
- Revocation and invitation cancellation write an explicit audit entry with the reason (`membership.revoked`, `membership.invitation_cancelled`) in addition to the row-change audit.
- **Brand colours (criterion 3):** `app.brand_color_is_readable(hex)` requires ≥ 4.5:1 with white text on the colour **and** ≥ 4.5:1 for the colour as text on ivory `#f7f5ef` (UI_UX_DESIGN_SYSTEM §2: brand overrides `--brand`/`--brand-contrast`; the stricter pair covers both uses). CHECK constraints on `tenant_profiles.primary_color` and `accent_color`. The task 6 form validator must use the same rule. Example: `#767676` passes on white (4.54) but fails on ivory, so it is refused.
- Profile hardening: `logo_path`/`hero_image_path` must be `{tenant_id}/branding/<generated>.jpg|png|webp` (no SVG); length limits on tagline, about, address, directions, map URL, policies and terms.
- Column-level UPDATE grants on `tenant_profiles`, `tenant_settings` and `permission_sets` (no `tenant_id`, `is_system`, `key`), so rows cannot be moved between hostels. Custom permission sets remain direct edits under the Phase 1 policies; system sets stay read-only.
- Test shim: `auth.users` gained `email_confirmed_at` (exists on Supabase).
- Hosted dev: same check as task 1; `npm run db:bundle -- --since 20261104120000 --no-seed` now contains the three Phase 2 migrations. If a hosted profile has a low-contrast colour the migration stops with a check violation; set that colour to null first.

### Task 4 notes
- Migration `20261114130000_add_platform_tenant_admin.sql`. All RPCs require `app.is_platform_admin()` (platform admin **and** aal2).
- **Direct platform writes removed:** the Phase 1 policies and grants that let platform admins insert/update `tenants` and insert/update/delete `tenant_domains` (and insert the first profile/settings rows) are dropped, so status changes and domain verification always go through checked, audited RPCs (DATABASE_DESIGN §1: transitions in RPCs). Reads are unchanged. No app code wrote these tables.
- `create_tenant(slug, name, prefix, root_domain?, admin_email?, legal_name?)`: tenant in `onboarding`, unpublished profile (display name = hostel name), default settings, the platform subdomain `{slug}.{root}` as verified + primary when the root domain is passed (wildcard on Vercel, ADR-0005; until D-1 none is created and the staging preview is used), and the first admin invitation. Slug lower-cased, prefix upper-cased; existing constraints give 23505 (duplicate) and 23514 (format, reserved slugs).
- `platform_invite_hostel_admin(tenant, email)`: only while the hostel has **no active** hostel admin (onboarding, or recovery if the admin left); afterwards the hostel's own admins invite staff. Invitation logic is shared with `invite_staff_member` through `app.open_invitation` (same behaviour, 011 still passes).
- `set_tenant_status(tenant, status, reason)`: onboarding → active (needs an invited or active hostel admin), active → suspended (stores time and reason), suspended → active (clears them). Everything else, including archiving, is refused. Each change writes an audit entry with the reason, visible to the hostel's admin (transparency).
- Domains: `add_custom_domain` (normalised; refused under the platform root domain, so a hostel cannot take another's subdomain, T18; 23505 if the hostname is in use), `set_domain_status` (manual pending/verified/failed until task 10; verification details ≤ 8 KB JSON object), `set_primary_domain` (verified only), `remove_domain` (with reason, audited). The primary domain must stay verified and cannot be removed; make another domain primary first.
- RBAC unchanged: a platform admin still cannot read a hostel's settings, memberships or audit log without break-glass. **For the platform UI (task 11)** the tenant detail page needs to show whether the first-admin invitation is open/accepted; that needs a narrow read RPC (invitation email + status only), to be added with task 11.
- Not in this task: hostel admins requesting a custom domain (RBAC §4) — only platform admins add domains in v1 UI; editing tenant name/legal name after creation; archiving/offboarding.
- Hosted dev: `npm run db:bundle -- --since 20261114120000 --no-seed`.

### Task 5 notes
- Migration `20261119100000_create_tenant_public_bucket.sql`: bucket `tenant-public` (public, 5 MB `file_size_limit`, `allowed_mime_types` JPEG/PNG/WebP only, so no SVG at the storage layer) and three policies on `storage.objects`, each limited to this bucket: insert, select (listing) and delete through `app.can_manage_public_asset(name)`. No update policy: objects are never overwritten or renamed (new uploads get new names).
- `app.can_manage_public_asset` accepts only the server-generated shapes `{tenant_id}/branding/<8-64 [a-z0-9-]>.jpg|png|webp` (needs `settings.manage`) and `{tenant_id}/room-types/{room_type_id}/<name>` (needs `inventory.manage` and a room type of that hostel). Traversal, other folders, other extensions and malformed ids are refused before any uuid cast. Suspended hostels, break-glass and anon cannot write. Same path shapes as the `tenant_profiles` and `room_type_photos` constraints.
- Public files are served by public URL; nobody but managers can **list** the bucket.
- PGlite shim: minimal `storage.buckets`, `storage.objects` (RLS on, Supabase's default grants) and `storage.foldername`. Real storage behaviour (bucket limits enforced by the Storage API, policies applied to uploads) must be checked on staging once the upload UI exists (task 13).
- **Upload path (product owner, in chat, 2026-11-22): server-only.** Migration `20261122100000_make_public_uploads_server_only.sql` drops `tenant_public_insert` and adds `public.can_upload_public_asset(name)`. Task 7 must: call that check with the user's session, validate and re-encode the file, then upload with the service role from `src/lib/server/uploads`. Listing and deleting keep their user-session policies. This closes the gap where a staff session could skip the re-encode.
- Hosted dev: bundle from the last applied migration: `--since 20261119100000` if task 5 is applied, `--since 20261114130000` if only task 4 is, `--since 20261114120000` if neither is.
- If the SQL Editor refuses `create policy … on storage.objects` (ownership), tell me; the policies can be created from Storage → Policies with the same expressions.

### Task 6 notes
- `src/lib/server/actions/inventory-actions.ts`: create/update/delete for booking periods, room types, rooms and beds; create/release bed blocks; set/delete prices. Bind the slug in the page (`createRoom.bind(null, tenantSlug)`) for `useActionState`.
- Every action checks, in order: app host, staff session + MFA (`requireStaffSession`, because layouts do not protect Server Actions), membership, permission, then Zod. `tenant_id` comes from the membership, never the form. Queries use the user's session, so RLS stays the final authority; a row RLS hides is reported as "no longer exists".
- `setRoomTypePrice` updates, then inserts: a PostgREST upsert would also write `tenant_id` and parent keys, which the column grants refuse.
- Errors: `src/lib/db-errors.ts` maps Postgres codes to staff messages; raw database text is never shown or logged (code + short reference only).
- Money is typed in cedis and parsed to pesewas without floats (`parseCedisToPesewas`). Datetimes are read as Africa/Accra (UTC+0).
- `src/lib/brand-color.ts` is the form rule (criterion 3); `tests/db/brand-color.test.ts` fails if it drifts from `app.brand_color_is_readable`.
- Room photo rows are not here: they are created with the upload pipeline (task 7). Profile and settings actions come with their UI (task 12).
- No browser or hosted test yet: the actions have no screens until task 13.

### Open security findings (found 2026-11-22, not fixed unless marked `[x]`)
- [x] **`next` 16.4.3 had moderate advisories** (including Cache Components cache disclosure/poisoning, and this project uses Cache Components). Fixed 2026-11-22 by upgrading to 16.4.6 (security fixes landed in 16.4.5). The 16.4.6 docs require no change to `src/proxy.ts` or `next.config.ts`.
- [x] **Hostel-admin MFA was enforced only in the app (fixed locally 2026-11-22).** Migration `20261122110000_enforce_admin_mfa_in_database.sql` adds `app.caller_meets_mfa_policy()` to `is_tenant_member`, `is_hostel_admin` and `has_permission`: an active hostel admin of an active hostel, or a platform-admin account, holds no staff access in any hostel until aal2. `my_memberships` stays readable at aal1 so the app can route them to MFA; their own resident record is unaffected. **To apply on hosted dev.**
- [ ] **Not covered by that fix:** ordinary staff who enrolled TOTP voluntarily. The app demands their code, but the database still accepts their aal1 session, within their permission set.

### Task 7 notes
- `src/lib/server/uploads/process-image.ts`: the type comes from the first bytes (never the name or browser MIME type) and must match what `sharp` decodes; SVG, PDF, GIF and HTML never reach the decoder. Limits: 5 MB, 40 megapixels. Output is always a fresh WebP with orientation applied and all metadata dropped. Maximum side: logo 800 px, room photo 1920 px, main photo 2400 px.
- `src/lib/server/uploads/public-images.ts`: generates the path, asks `public.can_upload_public_asset` **with the user's session**, processes the file, then stores it with the service role (no overwrite). It is the only upload code that imports the service-role client.
- `src/lib/server/actions/upload-actions.ts`: add/edit/delete room photos (`inventory.manage`), replace/remove logo and main photo (`settings.manage`). If the database row cannot be saved, the new file is removed; a replaced file is removed only after the new path is saved.
- `src/lib/server/staff-action.ts`: the shared host + session/MFA + membership + permission guard, now also used by the inventory actions.
- `sharp` 0.35.5 is a direct, pinned dependency (approved 2026-11-14). `serverActions.bodySizeLimit` is `6mb` (5 MB file + multipart overhead); this setting applies to all Server Actions.
- **Not verified yet:** real uploads through Supabase Storage and Vercel (no keys here; no screen until task 13).
- **Known limit to check on staging:** Vercel documents a request-body limit of about 4.5 MB for Functions, so files between roughly 4.5 and 5 MB may be refused by Vercel before our code runs. Task 13 should shrink large photos in the browser before sending, or the product owner can lower the stated limit to 4 MB. The server still re-encodes everything.
