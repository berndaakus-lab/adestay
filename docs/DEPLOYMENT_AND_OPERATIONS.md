# Deployment and Operations

> Status: Phase 0 draft. Nothing has been provisioned yet. No accounts, projects or keys exist for this platform as far as this repository shows.

## 1. Environments

| Env | Git branch | Hosting | Database | Payments | Purpose |
|---|---|---|---|---|---|
| Local | any | `next dev` | Hosted Supabase **dev** project (decided 2026-10-26; no local Docker) | Provider **test** keys | Development, pgTAP, Playwright |
| Staging | `staging` | Vercel (staging / preview deployment) | Supabase **dev/staging** project (never production) | Test keys | Development testing and product-owner review |
| Production | `main` | Vercel production | Supabase production project (Pro, PITR) | Live keys per tenant | Customers |

Production and staging use separate Supabase projects. Staging and preview deployments must never receive production secrets (Vercel environment scoping).

### Branching (product owner decision, 2026-10-26)
- `main` = **production**. Only updated by merging `staging` after the product owner approves.
- `staging` = **development testing**. Feature branches (e.g. `phase-1/foundation`) merge into `staging` through a pull request.
- No direct commits to `main` or `staging`.

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
| `LOG_REDACTION_SALT` | server | **NO** | Salt for IP hashing in audit logs |
| `SENTRY_DSN` (optional) | all | yes | Error monitoring, if approved [D-17] |

**Per-tenant payment secrets are not environment variables.** They are stored in Supabase Vault (`private.tenant_payment_configs.secret_ref`). If D-6/D-8 chooses a platform-level merchant account instead, `PAYSTACK_SECRET_KEY` / `HUBTEL_CLIENT_SECRET` become server-only env vars.

A `.env.example` with these names and empty values will be committed in Phase 1. `.env*` (except `.env.example`) stays gitignored.

## 3. Domains

- **Platform domain** [D-1]: e.g. `<brand>.com`, with wildcard `*.<brand>.com` on Vercel for tenant subdomains, plus `app.<brand>.com` for staff/platform.
- **Custom domains:** the hostel adds `book.theirhostel.com.gh`. The platform admin adds it via the Vercel Domains API. The UI shows the CNAME/TXT records to set; a cron polls verification; status is mirrored in `tenant_domains`. SSL is automatic through Vercel.
- **Email sending domain:** use the platform domain (`bookings@<brand>.com`) with the hostel name as display name and reply-to set to the hostel's address. Per-tenant sending domains are out of scope for v1.

## 4. CI/CD

GitHub Actions on every PR (once a GitHub remote is created [D-18]):
1. Install → typecheck (`tsc --noEmit`) → lint (ESLint, including the "no service-role import outside allow-list" rule) → unit tests (Vitest).
2. Spin up local Supabase → apply migrations → **pgTAP RLS/isolation tests** → integration tests.
3. Playwright E2E (smoke on PRs, full nightly) against the local stack.
4. Secret scan (gitleaks) and `npm audit --omit=dev` (high severity fails the build).
5. Vercel deploys through its Git integration (set up by the product owner): `staging` → staging, `main` → production.

**Production DB migrations:** applied to the staging database on merge to `staging`, and to production with `supabase db push` on merge to `main`, after manual approval (GitHub environment protection). Destructive migrations (drop/rename/narrowing type) need explicit product-owner approval and a backup checkpoint.

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
