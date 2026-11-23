# Deployment and Operations

> Status: Phase 0 draft. Nothing has been provisioned yet. No accounts, projects or keys exist for this platform as far as this repository shows.

## 1. Environments

| Env | Git branch | Hosting | Database | Payments | Purpose |
|---|---|---|---|---|---|
| Local | any | `next dev` | Hosted Supabase **dev** project (decided 2026-10-26; no local Docker) | Provider **test** keys | Development, pgTAP, Playwright |
| Staging | `staging` | Vercel (staging / preview deployment) | Supabase **dev/staging** project (never production) | Test keys | Development testing and product-owner review |
| Production | `main` | Vercel production | Supabase production project (Pro, PITR) | Live keys per tenant | Customers |

Production and staging use separate Supabase projects. Staging and preview deployments must never receive production secrets (Vercel environment scoping).

### Branching (product owner decision, updated 2026-10-26)
- `staging` = **development testing**. Development is committed and pushed directly to `staging`. No feature branches.
- `main` = **production**. The **product owner** merges `staging` into `main` personally. Claude never commits, pushes or merges to `main`.

### Vercel
The **product owner connects the GitHub repo to Vercel personally** and configures the production branch (`main`), the staging deployment (`staging`) and environment variables. Claude does not create or change Vercel projects, domains or settings.

## 2. Environment variable inventory (no real values)

| Name | Scope | Exposed to browser? | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | all | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or publishable key) | all | yes (public by design; RLS protects data) | Client auth/queries |
| `SUPABASE_SERVICE_ROLE_KEY` (or secret key) | server | **NO** | Allow-listed server modules only |
| `NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN` | all | yes | e.g. `example-platform.com`, for subdomain parsing |
| `NEXT_PUBLIC_APP_HOST` | all | yes | e.g. `app.example-platform.com` |
| `CRON_SECRET` | server | **NO** | Bearer token for `/api/cron/*` |
| `VERCEL_API_TOKEN` | server | **NO** | Add/verify custom domains (scoped token) |
| `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` | server | no | Domains API |
| `EMAIL_PROVIDER_API_KEY` | server | **NO** | Transactional email [D-9] |
| `EMAIL_FROM_DOMAIN` | server | no | Sending domain (SPF/DKIM/DMARC configured) |
| `SMS_PROVIDER_API_KEY`, `SMS_SENDER_ID` | server | **NO** | Phase 6 [D-10] |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | public / server | site key yes / secret NO | Only if D-11 approved |
| `LOG_REDACTION_SALT` | server | **NO** | Secret (16+ characters) for hashing IP addresses in the booking lookup rate limit and audit logs. **Booking lookup is unavailable until it is set.** Use a different value per environment |
| `SENTRY_DSN` (optional) | all | yes | Error monitoring, if approved [D-17] |

**Per-tenant payment secrets are not environment variables.** They are stored in Supabase Vault (`private.tenant_payment_configs.secret_ref`). If D-6/D-8 chooses a platform-level merchant account instead, `PAYSTACK_SECRET_KEY` / `HUBTEL_CLIENT_SECRET` become server-only env vars.

A `.env.example` with these names and empty values will be committed in Phase 1. `.env*` (except `.env.example`) stays gitignored.

## 3. Domains

- **Platform domain** [D-1]: e.g. `<brand>.com`, with wildcard `*.<brand>.com` on Vercel for tenant subdomains, plus `app.<brand>.com` for staff/platform.
- **Custom domains:** the hostel adds `book.theirhostel.com.gh`. The platform admin adds it via the Vercel Domains API. The UI shows the CNAME/TXT records to set; `/api/cron/verify-domains` polls verification (Bearer `CRON_SECRET`, at least 16 characters); status is mirrored in `tenant_domains`. SSL is automatic through Vercel. The schedule is **not** in the repository yet: Vercel runs crons on production deployments only, and a Hobby project fails to deploy with a schedule more frequent than daily. Until the product owner chooses a schedule, use "Check" in the platform UI.
- **Email sending domain:** use the platform domain (`bookings@<brand>.com`) with the hostel name as display name and reply-to set to the hostel's address. Per-tenant sending domains are out of scope for v1.

## 3a. Supabase Auth settings (dashboard, per environment)
Set by the product owner in Supabase Dashboard → Authentication. Values for the dev/staging project:

| Setting | Where | Value |
|---|---|---|
| Site URL | URL Configuration | The staging site, e.g. `https://<staging>.vercel.app` |
| Redirect URLs | URL Configuration | `https://<staging>.vercel.app/auth/callback` and `http://localhost:3000/auth/callback` |
| Email provider | Sign In / Providers → Email | Enabled; Confirm email on |
| Minimum password length | Sign In / Providers → Email (password settings) | 12 |
| Email OTP expiry | Sign In / Providers → Email | 600 seconds |
| TOTP MFA | Multi-Factor | Enabled |
| Magic Link email template | Emails → Templates → Magic Link | Must show the code: include `{{ .Token }}` (students type the 6-digit code) |
| Invite user email template | Emails → Templates → Invite user | Link must be `<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite&next=/reset-password">Accept your invitation</a>`. The default link does not work with the server callback. Site URL must be the staff app host. |
| SMTP | Emails → SMTP | Custom provider required before real students sign in (D-9). Built-in email only reaches project team members. |
| Minimum time between codes | Sign In / Providers → Email | 60 seconds per address |
| Email sending rate limit | Rate Limits | After custom SMTP (D-9): start at 100 emails per hour for the project, and raise it before admission peaks if real students are being refused. This cap covers all Auth email, including staff invitations and password resets |
| Leaked-password protection | Passwords | On, when the plan supports it |

Vercel: no extra variables are needed for the staging host (the app reads Vercel's runtime hostnames). Set `NEXT_PUBLIC_APP_HOST` once the root domain exists (e.g. `app.<domain>`).

## 3b. Scheduled jobs

| Job | Route | Intended schedule | Status |
|---|---|---|---|
| End overdue holds, email students, clean up rate-limit records | `/api/cron/expire-holds` | Every 15 minutes (`*/15 * * * *`, approved 2026-11-22; needs Vercel Pro) | Route built; **no schedule in the repository** |
| Check pending custom domains | `/api/cron/verify-domains` | Every 30 minutes on Pro, or daily on Hobby | Route built; **no schedule in the repository** |

Both need `CRON_SECRET` (16+ characters) and refuse every call without it. Vercel runs cron schedules on **production deployments only**, so staging must be triggered by hand with `Authorization: Bearer <CRON_SECRET>`. A schedule more frequent than daily makes a Hobby deployment fail, so the product owner must confirm the plan before a schedule is added.

Without the job, overdue holds still stop counting against capacity, but their status stays `held` and students get no "hold ended" email.

## 4. CI/CD

GitHub Actions (`.github/workflows/ci.yml`, implemented in Phase 1 task 8) on every push to `staging` and every pull request into `staging` or `main`. No secrets are needed.
1. **checks:** `npm ci` → typecheck (`next typegen` + `tsc`) → lint (ESLint, including the service-role allow-list rule) → unit tests → **database tests**: every migration applied in order to PGlite (in-process Postgres) plus all pgTAP files, including "every public table has RLS forced" and the tenant-isolation suite → build → **client bundle check** (`scripts/check-client-bundle.mjs`: no service-role key name, `sb_secret_` key, `service_role` JWT or real key value in `.next/static`).
2. **e2e:** Playwright on desktop and mobile Chromium against the built app, including axe WCAG 2.2 AA scans.
3. **security:** gitleaks over the full git history (checksum-verified binary) and `npm audit --omit=dev --audit-level=high`.

(The original plan ran a local Supabase stack in CI; PGlite gives the same migration + pgTAP coverage without Docker and matches local testing.)
5. Vercel deploys through its Git integration (set up by the product owner): `staging` → staging, `main` → production.

**How migrations reach Supabase (decided 2026-10-26, same as ugs-kitchen-v2):** the app uses only the URL, anon key and service-role key from Vercel. Schema changes are applied by the product owner in the Supabase SQL Editor using the bundle from `npm run db:bundle` (`--since <timestamp>` for new migrations only). The checklist records the last migration applied to each environment. Supabase CLI or GitHub Actions automation can replace this later.

**Production DB migrations:** applied to the staging database when pushed to `staging`, and to production with `supabase db push` on merge to `main`, after manual approval (GitHub environment protection). Destructive migrations (drop/rename/narrowing type) need explicit product-owner approval and a backup checkpoint.

## 5. Monitoring and alerting
| Signal | Tool | Alert |
|---|---|---|
| App errors | Vercel logs (+ Sentry if approved) | New error types, error rate spikes |
| DB health | Supabase dashboard / advisors (security & performance) | Advisor warnings reviewed weekly |
| Payment pipeline | `private.payment_events` with `failed` status; reconciliation mismatches | Email to platform admin immediately |
| Cron health | Each job writes a heartbeat row | Missing heartbeat > 2 intervals |
| Hold expiry backlog | Count of `held` reservations past expiry | > 0 for 30 min |
| Domain status | `tenant_domains` failed/expired | Daily digest |
| Spend | Vercel & Supabase spend limits/alerts | Threshold alerts |

## 6. Backups and recovery
- Supabase Pro daily backups (retention per plan). **PITR add-on recommended** before the first payment goes live [D-12].
- Weekly logical dump (`pg_dump` of schemas, excluding `auth`) to encrypted off-platform storage [D-12]. Storage buckets are synced weekly.
- **Targets (proposed):** RPO ≤ 24 h without PITR, ≤ 5 min with PITR; RTO ≤ 4 h.
- **Restore drill:** before launch, restore to a scratch project, run the smoke test, and document the timings.
- **Single-tenant restore runbook:**
  1. Restore the backup into a temporary project.
  2. Export that tenant's rows by `tenant_id` (DATABASE_DESIGN §7).
  3. Diff against production.
  4. Apply with approval.
  5. Delete the temporary project.

## 7. Operational runbooks (to be written in Phase 7)
- Onboarding a hostel (tenant, domain, first admin, gateway keys, inventory import from CSV).
- Suspending and restoring a tenant.
- Rotating keys (Supabase, gateway, cron, Vercel token).
- Handling a payment dispute or mismatch.
- Responding to a suspected data breach (containment, assessment, DPC/affected-party notification per legal advice).
- Offboarding a tenant (export, domain removal, retention, deletion).

## 8. Launch checklist (outline; detailed in Phase 7)
- [ ] All Phase 1–6 acceptance criteria passed and recorded in the checklist.
- [ ] Tenant-isolation suite green in production-like staging.
- [ ] Supabase Auth production settings: SMTP provider, rate limits, MFA, leaked-password protection, redirect allow-list for `app.` host.
- [ ] Gateway live keys configured for the first tenant; live ₵1 test payment and refund done.
- [ ] Backups/PITR verified; restore drill done.
- [ ] Privacy policy, terms and refund policy published; legal items in SECURITY_THREAT_MODEL §8 resolved.
- [ ] Staff training completed; support contact defined.
- [ ] Monitoring and alerts verified by firing test alerts.
