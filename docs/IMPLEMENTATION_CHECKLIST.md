# Implementation Checklist

> The single source of truth for progress. Update it at the end of every task. A test counts as **passed** only if it was executed and the result is recorded here.
>
> Status legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked

## Phase approval status

| Phase | Status | Approved by / date |
|---|---|---|
| 0: Architecture & Planning | **Approved** | Product owner, in chat, 2026-10-26 |
| 1: Foundation & Security | **Approved, in progress** | Product owner, in chat, 2026-10-26 |
| 2: Tenant setup & Administration | Not started | — |
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
- [~] 3. Supabase project link + first migrations (tenancy, memberships, residents, permissions, audit log) + seed data — migrations, seed and tests done and passing locally (2026-10-26); **not yet applied to the hosted dev project** (see blocker)
- [x] 4. RLS policies, helper functions and pgTAP tenant-isolation tests — done and passing locally (2026-10-26); applied to hosted dev 2026-10-26
- [ ] 5. Host → tenant resolution middleware, `getTenantContext`, `requirePermission`, service-role allow-list lint rule
- [ ] 6. Auth: staff email + password with TOTP MFA for admins; student email OTP
- [ ] 7. Public, staff and platform shells; 404 / 403 / suspended pages
- [ ] 8. GitHub Actions CI and `.env.example`

### Blockers / needs from product owner
- [x] Hosted Supabase dev project created; keys are in Vercel environment variables (product owner, 2026-10-26).
- [ ] **Apply migrations to the hosted dev project** the same way as ugs-kitchen-v2 (product owner decision, 2026-10-26): `npm run db:bundle` writes `supabase/.temp/apply-all.sql` (all migrations + dev seed, gitignored); the product owner pastes it into the Supabase SQL Editor and runs it once. Later migrations: `npm run db:bundle -- --since <last applied timestamp> --no-seed`. Record the last applied migration here after each run.
- Last migration applied to hosted dev: `20261026150000_add_authorization_helpers_and_rls.sql` (product owner, SQL Editor, 2026-10-26; check `residents_select` policy exists → true). Earlier: migrations 20261026130000-130300 + dev seed. `postgres` bypasses RLS: confirmed true.
- [ ] For local runs of the app against the hosted project (from task 5): `vercel env pull .env.local` or create `.env.local` manually.

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
