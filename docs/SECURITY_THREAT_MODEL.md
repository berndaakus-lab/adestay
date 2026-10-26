# Security Threat Model

> Status: Phase 0 draft. Method: assets → trust boundaries → STRIDE-style threats with mitigations. This document makes **no compliance claims**; §8 lists obligations that must be verified.

## 1. Assets
| Asset | Sensitivity |
|---|---|
| Student PII (name, phone, email, institution, student ID, gender, emergency contacts) | High |
| Financial records (invoices, payments, refunds, payment evidence) | High |
| Gateway secret keys, Supabase service-role key, cron/webhook secrets | Critical |
| Staff and admin accounts, especially platform admins | Critical |
| Inventory and booking integrity (who holds which bed) | High (operational and financial) |
| Tenant branding and public content | Low (integrity matters) |
| Audit logs | High (integrity) |

## 2. Trust boundaries
1. **Browser → Vercel:** everything from the browser is untrusted, including Host-derived values *after* our own resolution, form fields, hidden inputs, tenant IDs and query strings.
2. **Browser → Supabase directly:** the anon key is public, so anyone can call PostgREST, Auth and Storage directly. **RLS is the only control on this path.**
3. **Vercel server → Supabase:** user-JWT clients (RLS applies) and the service-role client (RLS bypassed; allow-listed modules only).
4. **Payment provider → webhook endpoint:** untrusted until the signature is verified *and* the transaction is re-verified via the API.
5. **Platform admins → tenant data:** a deliberate, audited boundary (break-glass).

## 3. Threats and mitigations

| # | Threat | Example | Mitigations | Verification |
|---|---|---|---|---|
| T1 | **Cross-tenant data access** | Staff of Hostel A queries Hostel B residents by changing a slug or calling PostgREST directly | RLS on every tenant table using `app.has_permission(tenant_id, …)`; composite FKs; tenant derived from membership, not input; no service role in request paths; `FORCE ROW LEVEL SECURITY` | pgTAP: for every table, user of tenant A gets 0 rows/denied for tenant B (read and write); CI check that every `public` table has RLS enabled |
| T2 | **Broken access control** | Front-desk staff approves bookings or exports data | Permission checks in server + RPC; deny by default; RBAC matrix tests | Table-driven authorization tests per role × operation |
| T3 | **IDOR** | `/portal/invoices/<uuid>` for another student | RLS-scoped fetches; UUIDs plus unguessable references; 404 on not-found/not-allowed; booking lookup requires reference **and** matching email/phone | E2E tests with swapped IDs |
| T4 | **Authentication/session weaknesses** | Credential stuffing, session theft | Supabase Auth with `@supabase/ssr` httpOnly, Secure, SameSite=Lax cookies; MFA (TOTP) required for hostel admins and platform admins; leaked-password protection and minimum length; short JWT expiry (1 h) with refresh rotation; sign-out revokes the refresh token; OTP rate limits | Config review checklist; tests for MFA enforcement on admin routes |
| T5 | **Privilege escalation** | Staff edits own permission set; user inserts into `tenant_memberships` | No direct write policies on memberships/permission sets; RPCs block self-change and granting permissions the caller lacks; `platform_admins` writable only via migration/CLI | pgTAP negative tests |
| T6 | **Public endpoint abuse** | Spam booking requests, enumerating references, OTP flooding | Verified email before submit; per-IP and per-email rate limits (`app.check_rate_limit`); optional Turnstile [D-11]; references of 30 bits of entropy plus a lookup that needs email/phone, rate-limited to 5 per 15 min per IP; uniform error responses | Load/abuse tests in Phase 7 |
| T7 | **SQL injection** | Unsafe string building in RPCs or reports | supabase-js parameterised queries; no dynamic SQL in RPCs except `format()` with `%I/%L`; Zod validation; `search_path = ''` on SECURITY DEFINER functions | Lint/grep CI check for `execute` without `format`; code review |
| T8 | **XSS** | Malicious hostel "about" text or maintenance description | React escaping; Markdown rendered with a sanitiser and an allow-list (no raw HTML); strict CSP (nonce-based scripts, `frame-ancestors 'none'`); brand colours validated as hex | CSP report-only in Phase 1, enforce by Phase 7; XSS payload tests |
| T9 | **CSRF** | Cross-site form posts to Server Actions | Next.js Server Actions check Origin against Host; SameSite=Lax cookies; route handlers that mutate require POST + origin check; webhooks are exempt but signature-verified | Tests with foreign Origin |
| T10 | **Secret leakage** | Service-role key bundled into client JS; keys in git | Only `NEXT_PUBLIC_*` reaches the browser; `server-only` import guard on admin client; gateway secrets in Supabase Vault, never returned to the UI; `.env*` gitignored; secret scanning (gitleaks) in CI | Build check: grep the client bundle for key patterns |
| T11 | **Insecure file uploads** | HTML/SVG upload executing script; huge files; path traversal | MIME + magic-byte check, size ≤ 5 MB, no SVG uploads, server-generated paths, image re-encode, private bucket + short signed URLs for evidence, `Content-Disposition: attachment` for PDFs | Upload tests with polyglot files |
| T12 | **Payment fraud and webhook spoofing** | Forged `charge.success`; client claims "paid" | Signature verification over the raw body (constant-time compare); per-tenant webhook endpoint id; **always re-verify via provider API**; confirmation only from server-verified status; amount/currency/reference matching | Test suite with forged, replayed and mismatched events |
| T13 | **Duplicate payment processing** | Retries double-credit an invoice | Unique `(provider, dedupe_key)`; idempotent `apply_verified_payment`; unique provider reference; row locks | Concurrency test: 10 parallel identical webhooks → one credit |
| T14 | **PII exposure** | Staff export of all residents; verbose API responses | Minimal collection; column-level separation (`residents_sensitive`); exports permission-gated and audited; select only needed columns; booking lookup returns status only | Review of every list endpoint's columns |
| T15 | **Excessive logging** | Tokens, OTPs, MoMo numbers in logs | Structured logger with a redaction list (authorization, cookie, password, otp, secret, key, phone → masked, email → masked); webhook payloads sanitised before storage; never log full request bodies | Unit test on the logger redaction |
| T16 | **Backup and recovery risks** | Data loss; restoring the wrong tenant over another | Supabase Pro backups + PITR [D-12]; restore drills into a separate project; per-tenant restore via scripted copy; backups inherit Supabase encryption at rest | Restore drill before launch (Phase 7) |
| T17 | **Administrative misuse** | Platform admin browses student data; hostel staff snoop | Platform admins have no default tenant-data access; break-glass grants with reason, ≤ 4 h, visible to the tenant's admin; append-only audit log; staff least privilege; regular access review | Audit visibility tests; review checklist |
| T18 | **Host header / domain spoofing** | Request with forged Host to reach another tenant's data | Host only selects *public* tenant content; private data always needs membership/ownership checks; only verified domains resolve; middleware strips inbound internal headers | Tests with spoofed Host and `x-tenant-id` headers |
| T19 | **Subdomain/custom-domain takeover** | A hostel's DNS still points to us after offboarding | Domains removed from Vercel when the tenant is archived; periodic dangling-domain check | Ops runbook |
| T20 | **Denial of wallet** | Bot traffic driving Vercel/Supabase costs | Static/ISR public pages; rate limits; Vercel firewall rules; spend alerts | Billing alerts set in Phase 7 |

## 4. RLS policy requirements (checklist for every migration)
- [ ] `alter table … enable row level security; alter table … force row level security;`
- [ ] Explicit policies per command. No `using (true)` except for public-content `SELECT`, which must still check `is_published` and tenant active.
- [ ] Policies reference `tenant_id`, never a client-provided value.
- [ ] Workflow tables have no INSERT/UPDATE/DELETE policies (RPC only).
- [ ] SECURITY DEFINER functions: `set search_path = ''`, fully qualified names, `revoke execute from public`, grants to the intended role only.
- [ ] pgTAP isolation test added.

## 5. Input validation, errors, rate limiting
- **Validation:** shared Zod schemas validate on the client for UX and **again on the server**. DB `CHECK` constraints are the last line. Phone numbers are normalised to E.164 and amounts parsed as integers in pesewas.
- **Errors:**
  - Users see generic messages with a correlation id.
  - Full error details go to server logs, redacted.
  - A Postgres `23P01`/`23505` error is mapped to friendly conflict messages.
- **Rate limits (initial):**

| Action | Limit |
|---|---|
| OTP send | 5 / hour / email |
| Booking submit | 5 / hour / user |
| Lookup | 5 / 15 min / IP |
| Login | handled by Supabase |
| Payment initiation | 10 / hour / user |

## 6. Break-glass procedure (platform admin → tenant private data)
1. The platform admin creates a `platform_access_grants` row with a reason and ticket ref; it expires in ≤ 4 h. MFA is required.
2. RLS helper `app.has_break_glass(tenant_id)` grants **read-only** access. Writes are still refused, except specific support RPCs that log their own reason.
3. The tenant's hostel admin sees the grant in their audit view and is emailed.
4. A monthly review of all grants is performed.

## 7. Data minimisation and retention [D-13]
- Collect only what the booking needs. Student ID number, gender and programme are optional per tenant settings.
- Emergency contacts are used only for welfare and emergencies and visible only with `residents.read_sensitive`.
- Proposed retention (needs legal review):

| Data | Retention |
|---|---|
| Applicant data (rejected/withdrawn) | 12 months |
| Resident data | Duration of stay + 2 years |
| Financial records | 7 years (verify Ghana tax/record requirements) |
| Audit logs | 2 years |

- Residents can request access, correction and deletion (subject to financial-record retention) through the hostel.

## 8. Legal and regulatory items to verify before launch (no claims made)
| Area | What to verify | Who |
|---|---|---|
| **Data Protection Act, 2012 (Act 843)** | Whether each hostel (data controller) and the platform operator (processor) must register with the Data Protection Commission; lawful basis; notices; cross-border transfer implications (Supabase/Vercel regions are outside Ghana) | Ghanaian lawyer / DPC |
| Data processing agreement | Contract terms between the platform and each hostel | Lawyer |
| **Payment regulation** | If the platform ever collects funds on behalf of hostels (e.g. split/subaccount models), whether this requires Bank of Ghana licensing or a regulated partner; the current recommendation avoids holding funds (ADR-0004) | Lawyer / payment provider |
| Gateway merchant eligibility | Each hostel's KYC/business registration for Paystack/Hubtel | Provider |
| Tax / invoicing | GRA VAT/levies on rent and service fees; whether receipts must follow specific formats or e-invoicing rules | Accountant |
| Consumer terms | Refund/cancellation disclosures, privacy policy, terms of use per tenant | Lawyer |
| Cybersecurity | Applicability of the Cybersecurity Act, 2020 (Act 1038) to the platform | Lawyer |
| Electronic records | Electronic Transactions Act, 2008 (Act 772): validity of electronic receipts and consent | Lawyer |
