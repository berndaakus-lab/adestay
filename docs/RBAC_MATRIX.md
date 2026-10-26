# RBAC Matrix

> Status: Phase 0 draft. Authorization is enforced **on the server (`requirePermission`) and in the database (RLS + RPC checks)**. Hiding UI is cosmetic only.

## 1. Roles

| Role | Scope | How granted | Stored in |
|---|---|---|---|
| Platform Super Admin | Platform | Manual CLI/migration only; MFA (aal2) required | `platform_admins` |
| Hostel Admin | One tenant | Platform admin at onboarding, or another hostel admin | `tenant_memberships.role = 'hostel_admin'` |
| Hostel Staff | One tenant | Hostel admin invites and assigns a permission set | `tenant_memberships.role = 'staff'` + `permission_set_id` |
| Student / Resident | One tenant per `residents` row | Self, by verifying email and submitting a booking | `residents.user_id` |
| Visitor (anon) | Public pages of one tenant | n/a | n/a |

One auth user can be staff at several tenants, and can also be a resident at a tenant. Roles are always evaluated **per tenant**.

## 2. Permission catalog

| Key | Meaning |
|---|---|
| `bookings.read` | View booking requests and reservations |
| `bookings.review` | Approve, reject, waitlist, extend holds |
| `bookings.cancel` | Cancel requests/reservations on behalf of the hostel |
| `bookings.create_on_behalf` | Create a request for a walk-in student |
| `allocations.read` | View bed allocations and the bed map |
| `allocations.manage` | Assign, move, release beds |
| `inventory.read` | View room types, rooms, beds, blocks |
| `inventory.manage` | Create/edit room types, rooms, beds, blocks, booking periods |
| `pricing.manage` | Edit prices and deposits |
| `residents.read` | Resident directory: name, contact, institution, booking status |
| `residents.read_sensitive` | Emergency contacts, student ID number, gender |
| `residents.manage` | Edit resident records, block a resident |
| `checkin.manage` | Check-in, check-out, no-show, key events |
| `finance.read` | Invoices, payments, balances |
| `finance.invoice_manage` | Create/issue/void invoices, add items |
| `finance.record_payment` | Record manual/offline payments with evidence |
| `finance.refund_request` | Request a refund |
| `finance.refund_approve` | Approve a refund (cannot approve one's own request) |
| `maintenance.read` | View maintenance requests |
| `maintenance.manage` | Assign, update, close; block beds for maintenance |
| `announcements.manage` | Publish announcements |
| `reports.read` | View reports |
| `reports.export` | Export CSV (audited) |
| `settings.read` | View tenant settings |
| `settings.manage` | Edit operational settings, profile, branding |
| `payments.configure` | Set gateway keys (admin only, never delegable) |
| `staff.manage` | Invite/revoke staff, edit permission sets |
| `audit.read` | View the tenant audit log |

`hostel_admin` implicitly holds **all** tenant permissions. `payments.configure` and `staff.manage` **cannot** be added to staff permission sets in v1 [R].

## 3. Proposed system permission sets for staff

| Permission | Front Desk | Accounts | Maintenance | Manager |
|---|:-:|:-:|:-:|:-:|
| bookings.read | ✓ | ✓ | | ✓ |
| bookings.review | | | | ✓ |
| bookings.cancel | | | | ✓ |
| bookings.create_on_behalf | ✓ | | | ✓ |
| allocations.read | ✓ | | ✓ | ✓ |
| allocations.manage | | | | ✓ |
| inventory.read | ✓ | | ✓ | ✓ |
| inventory.manage | | | | ✓ |
| pricing.manage | | | | |
| residents.read | ✓ | ✓ | | ✓ |
| residents.read_sensitive | ✓ (for check-in) | | | ✓ |
| residents.manage | | | | ✓ |
| checkin.manage | ✓ | | | ✓ |
| finance.read | (balance only*) | ✓ | | ✓ |
| finance.invoice_manage | | ✓ | | ✓ |
| finance.record_payment | | ✓ | | ✓ |
| finance.refund_request | | ✓ | | ✓ |
| finance.refund_approve | | | | ✓ |
| maintenance.read | ✓ | | ✓ | ✓ |
| maintenance.manage | | | ✓ | ✓ |
| announcements.manage | | | | ✓ |
| reports.read | | ✓ | | ✓ |
| reports.export | | | | ✓ |
| settings.read | | | | ✓ |
| audit.read | | | | ✓ |

\* Front desk sees a "payment threshold met: yes/no" flag at check-in through a narrow RPC, not invoice detail.

Hostel admins can clone a system set and adjust it, subject to the restrictions in §2.

## 4. Resource × role matrix

Legend: **C**reate **R**ead **U**pdate **D**elete/cancel · **own** = only records about themselves · **perm** = staff only if their set includes the named permission · — = no access.

| Resource / operation | Platform Admin | Hostel Admin | Hostel Staff | Student / Resident | Visitor |
|---|---|---|---|---|---|
| Tenants (create, suspend, restore) | CRUD | R (own tenant) | — | — | — |
| Tenant domains | CRUD, verify | R; request custom domain | — | — | — |
| Tenant profile & branding | R (public); U only with break-glass | RU | R; U with `settings.manage` | R (published) | R (published) |
| Tenant settings | — (break-glass R) | RU | perm `settings.*` | — | — |
| Gateway configuration | status only (no secrets) | C/U keys (write-only) | — | — | — |
| Staff memberships | C first hostel admin at onboarding | CRUD (not self-demote, not last admin) | — (or R own) | — | — |
| Permission sets | R system sets | CRUD custom | R own set | — | — |
| Booking periods | — | CRUD | R; CUD with `inventory.manage` | R (open) | R (open) |
| Room types, photos, prices | — | CRUD | R; CUD with perm | R (published) | R (published) |
| Rooms, beds, bed blocks | — | CRUD | R with `inventory.read`; CUD with perm | R own assigned room/bed only | — |
| Availability indicator | aggregate only | R | R | R | R (indicator only) |
| Booking request: submit | — | C (on behalf) | C with `bookings.create_on_behalf` | C own (verified email) | — (must verify email) |
| Booking request: view | aggregate counts | R | R with `bookings.read` | R own | Lookup by ref + email/phone (minimal status only) |
| Approve / reject / waitlist | — | U | U with `bookings.review` | — | — |
| Cancel request | — | U | U with `bookings.cancel` | U own, per policy | — |
| Reservation hold extend | — | U | U with `bookings.review` | — | — |
| Bed allocation | — | CRUD | CRUD with `allocations.manage` | R own | — |
| Residents directory | — (break-glass R) | CRU, block | R with `residents.read`; sensitive with `read_sensitive` | RU own (limited fields) | — |
| Check-in / out | — | CU | CU with `checkin.manage` | R own events | — |
| Invoices | aggregate revenue only | CRU, void | perm `finance.*` | R own (issued) | — |
| Payments: online | — | R | R with `finance.read` | C (initiate own) R own | — |
| Payments: manual record | — | C | C with `finance.record_payment` | — | — |
| Refunds | — | C, approve | request/approve per perm (4-eyes) | R own | — |
| Receipts | — | R | R with `finance.read` | R own (download) | — |
| Maintenance requests | — | CRUD | perm `maintenance.*` | C, R own, cancel own while open | — |
| Announcements | — | CRUD | perm | R (own tenant, if active resident) | — |
| Reports & exports | platform ops metrics | R, export | perm | — | — |
| Audit log | platform events; tenant rows with break-glass | R | R with `audit.read` | — | — |
| Break-glass grants | C (with reason, ≤ 4 h) | R (on own tenant) | — | — | — |

## 5. Enforcement rules
1. **Server:** every Server Action and route handler begins with `const ctx = await getTenantContext(); requirePermission(ctx, '<perm>')`. Missing permission returns a 404 for resource reads (prevents existence probing) or a 403 for actions.
2. **Database:** RLS `SELECT` policies use `app.has_permission(tenant_id, '<perm>')`. Write RPCs re-check the permission and `tenant_id` from the target row.
3. **IDOR:** objects are always fetched as `where id = $1` under RLS. They are never fetched first with the service role and filtered in JS.
4. **Self-escalation:** RPCs prevent changing your own role or permission set, granting permissions you do not hold, and removing the last hostel admin.
5. **Suspension:** `app.is_tenant_member` returns false while the tenant is suspended. Staff lose access, the public site shows "temporarily unavailable", and students keep **read-only** access to invoices and receipts [D-16].
6. **Tests:** pgTAP tests and an RBAC table-driven test assert every cell of §4 for at least one positive and one negative case per role.
