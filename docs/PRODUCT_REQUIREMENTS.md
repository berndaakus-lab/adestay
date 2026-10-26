# Product Requirements

> Status: **Phase 0 draft — awaiting product-owner approval.**
> Legend used throughout the docs: **[C]** confirmed requirement (from the master brief), **[A]** assumption, **[R]** recommendation, **[D-n]** open decision (see §9).

## 1. Product summary

A multi-tenant SaaS platform that gives each Ghanaian hostel business its own branded booking website, a staff administration workspace, and a student/resident portal, all running on one shared codebase and database with strict tenant isolation. [C]

It is **not** a marketplace: there is no cross-hostel search. Visitors book directly through an individual hostel's site. [C]

Working product name in the Figma prototype: **ResidenceOS** (platform). Demo tenant: **Alder House**. Neither name is confirmed. [D-1]

## 2. Customers and scale

| Item | Value | Source |
|---|---|---|
| First customer | One hostel, up to ~50 beds | [C] |
| Growth target | Many independent hostels without a redesign | [C] |
| Planning envelope for v1 | ≤ 30 tenants, ≤ 5,000 beds, ≤ 20,000 residents/year, low hundreds of concurrent users at semester start | [A] |
| Peak load pattern | Bursty around admission lists and semester start (Aug/Sep, Jan) | [A] |
| Currency | GHS only in v1, stored in pesewas | [C]/[R] |
| Language | English in v1 | [A] |
| Time zone | Africa/Accra (UTC+0, no DST) | [A] |

## 3. Personas

1. **Platform Super Admin** runs the platform: onboards hostels, manages domains, handles suspensions.
2. **Hostel Admin** is the owner or manager of one hostel and controls everything inside that tenant.
3. **Hostel Staff** are porters, front desk and accounts staff with only the permissions they are assigned.
4. **Student / Resident** is usually a tertiary student (e.g. UG, KNUST, UCC, UPSA), mostly on a phone, often on mobile data, and usually paying with Mobile Money. [A]
5. **Visitor / Applicant** is an unauthenticated person browsing a hostel's site.

## 4. Functional requirements

### 4.1 Platform administration [C]
- PA-1 Create, edit, activate, suspend and restore tenants.
- PA-2 Manage tenant domains (platform subdomain and custom domain) and their verification status.
- PA-3 View platform-wide *operational* metrics (tenant count, bed count, domain health, error rates). These views show no student PII by default.
- PA-4 Break-glass access to a tenant's private data only with a recorded reason, a time limit and an audit entry (see SECURITY_THREAT_MODEL §6).
- PA-5 Platform-level settings (default policies, feature flags).

### 4.2 Tenant setup and hostel administration [C]
- HA-1 Hostel profile: name, logo, photos, address, GPS/landmark directions, contacts, policies, terms.
- HA-2 Branding: logo, primary/accent colour (validated for contrast), hero imagery.
- HA-3 Inventory: room types → rooms → beds; block, house or floor labels; bed status (active, maintenance, retired).
- HA-4 Booking periods (academic year, semester, vacation/short stay) with dates and per-period pricing.
- HA-5 Pricing per room type per booking period; deposit rules; due dates.
- HA-6 Staff management: invite staff, assign permission sets, revoke access.
- HA-7 Operational settings: hold expiry, approval policy, check-in requirements, payment policy.

### 4.3 Public booking website [C]
- PB-1 Branded homepage per tenant on its own subdomain or custom domain.
- PB-2 Room-type listings and room-type detail pages (photos, amenities, price per period, availability indicator).
- PB-3 Booking request: the student chooses a booking period and room type. **No bed is selected.**
- PB-4 Booking reference generated and shown on screen and by email.
- PB-5 Booking status lookup by reference plus email or phone.
- PB-6 Policies, contact and directions pages.

### 4.4 Booking operations and bed allocation [C]
- BO-1 Staff review queue with filters (status, period, room type, age).
- BO-2 Approve or reject with reason. Approval creates an inventory hold (see BOOKING_AND_PAYMENT_FLOWS).
- BO-3 Assign a specific available bed to an approved booking. The database prevents double allocation.
- BO-4 Reassign or move a bed, with reason and audit.
- BO-5 Waitlist when a room type is full for a period. [R]
- BO-6 Cancel by staff or student according to policy.

### 4.5 Student portal [C]
- SP-1 Profile with minimal PII and an emergency contact.
- SP-2 Booking requests and history across periods.
- SP-3 Status timeline: request → approval → hold/payment → bed → check-in.
- SP-4 Assigned room and bed, plus check-in instructions.
- SP-5 Invoices, balances, payment history, downloadable receipts.
- SP-6 Maintenance requests and complaints, with status.
- SP-7 Announcements and policies for their hostel.

### 4.6 Finance [C]
- FI-1 Invoices with line items (rent, deposit, fees); GHS; due dates.
- FI-2 Online payments through an approved gateway (Paystack or Hubtel, [D-6]), verified server-side.
- FI-3 **Manual/offline payments** (cash, bank deposit, MoMo to the hostel's merchant number) recorded by authorised staff with evidence. [R] This is very common in Ghana and should not wait for gateway approval.
- FI-4 Receipts generated for every confirmed payment.
- FI-5 Outstanding balance and overdue tracking; configurable late-payment handling.
- FI-6 Refunds recorded (gateway refunds are initiated in the provider dashboard in v1). [R]
- FI-7 Reconciliation report: gateway transactions versus invoices.

### 4.7 Check-in / check-out [C]
- CI-1 Arrivals list; check-in confirms identity, payment threshold and bed.
- CI-2 Check-out with room condition notes; releases the bed.
- CI-3 No-show handling.

### 4.8 Maintenance [C]
- MT-1 Students and staff log requests (category, urgency, room/bed, photo optional).
- MT-2 Staff triage, assign, update status, close.
- MT-3 Optionally block a bed or room while under maintenance.

### 4.9 Notifications [C, scope to be agreed]
- NO-1 Transactional email: booking received, approved/rejected, bed assigned, invoice issued, payment received, hold expiring.
- NO-2 SMS for key events (approval, payment due). The provider is still to be chosen [D-10].
- NO-3 In-portal notifications.

### 4.10 Reports [C]
- RP-1 Occupancy by period and room type.
- RP-2 Revenue collected and outstanding, aged receivables.
- RP-3 Booking funnel (requests → approved → paid → checked in).
- RP-4 CSV export (permission-gated, audited).

## 5. Non-functional requirements

| ID | Requirement | Target |
|---|---|---|
| NF-1 | Tenant isolation | No cross-tenant read/write possible via UI, API or direct PostgREST calls; proven by automated tests |
| NF-2 | Mobile-first performance | Public pages LCP < 2.5 s on mid-range Android over 4G; JS on public pages kept small |
| NF-3 | Accessibility | WCAG 2.2 AA for all core flows |
| NF-4 | Availability | Inherits Vercel + Supabase SLAs; no self-managed servers |
| NF-5 | Data durability | Daily backups minimum; PITR recommended before launch [D-12] |
| NF-6 | Auditability | All state changes to bookings, allocations, payments, roles and settings are audit-logged |
| NF-7 | Privacy | Data minimisation; PII visible only to roles that need it |
| NF-8 | Maintainability | One Next.js app, one database, typed end to end; maintainable by one developer |
| NF-9 | Cost | Fits Vercel Pro + Supabase Pro (~US$45/month base) at first-customer scale [A] |

## 6. Ghana-specific considerations
- **Currency:** GHS, displayed as `GH₵ 1,250.00`; stored as integer pesewas.
- **Phones:** stored in E.164 (`+233XXXXXXXXX`), with local `0XX XXX XXXX` input accepted and normalised. Network detection (MTN, Telecel, AT) is used only as a MoMo UX hint.
- **Mobile Money** is the primary payment method; cards are secondary.
- **Academic calendar:** booking periods follow university semesters; demand spikes around admission and resumption dates.
- **Addresses:** many hostels rely on landmarks and Ghana Post GPS digital addresses (e.g. `GA-123-4567`), so the profile supports an optional digital address field.
- **Connectivity:** pages must work on slow networks, use compressed images, and handle network failures gracefully during payment.

## 7. Out of scope for v1 [R]
- Cross-hostel marketplace and search.
- Native mobile apps (the web is responsive; a PWA can come later).
- Multi-currency and multi-language.
- Automated gateway refunds via API.
- Accounting-system integrations.
- Self-service tenant sign-up (the platform admin onboards hostels manually in v1).
- Dynamic pricing, discounts and coupons (simple per-period pricing only).

## 8. Success metrics (first customer)
- 100% of bookings for the next intake processed through the platform.
- Zero double-allocated beds (enforced by the database).
- Staff time per booking under 3 minutes from review to bed assignment.
- Payment reconciliation differences resolved within 1 business day.

## 9. Open business decisions (summary)
Full list with recommendations: [IMPLEMENTATION_PLAN.md §6](IMPLEMENTATION_PLAN.md#6-decisions-required-from-the-product-owner).
