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
| Dev database | **Hosted Supabase dev project** (no local Docker). The product owner creates it and puts keys in `.env.local`; keys are never pasted into chat. |

### Also produced in Phase 0
- Client proposal for the first hostel (kept outside the code history; `proposals/` is gitignored).

## Phase 1: Foundation & Security (started 2026-10-26)

### Tasks
- [~] 1. Scaffold Next.js (App Router, TS strict), Tailwind v4, shadcn/ui, ESLint, Vitest, Playwright
- [ ] 2. Modern Residence design tokens, fonts and base components; component gallery page
- [ ] 3. Supabase project link + first migrations (tenancy, memberships, residents, permissions, audit log) + seed data
- [ ] 4. RLS policies, helper functions and pgTAP tenant-isolation tests
- [ ] 5. Host → tenant resolution middleware, `getTenantContext`, `requirePermission`, service-role allow-list lint rule
- [ ] 6. Auth: staff email + password with TOTP MFA for admins; student email OTP
- [ ] 7. Public, staff and platform shells; 404 / 403 / suspended pages
- [ ] 8. GitHub Actions CI and `.env.example`

### Blockers / needs from product owner
- [ ] Hosted Supabase dev project created, with its URL, anon key and service-role key placed in `.env.local` (needed from task 3).

### Test results
_None yet._
