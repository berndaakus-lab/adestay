import type { Permission } from "@/lib/permissions";

/** Plain-language permission names for the staff screens (docs/RBAC_MATRIX.md §2). */
export const PERMISSION_GROUPS: { title: string; items: { key: Permission; label: string }[] }[] = [
  {
    title: "Bookings",
    items: [
      { key: "bookings.read", label: "View booking requests and reservations" },
      { key: "bookings.review", label: "Approve, reject, waitlist, extend holds" },
      { key: "bookings.cancel", label: "Cancel on behalf of the hostel" },
      { key: "bookings.create_on_behalf", label: "Create a request for a walk-in student" },
    ],
  },
  {
    title: "Beds and rooms",
    items: [
      { key: "allocations.read", label: "View bed allocations and the bed map" },
      { key: "allocations.manage", label: "Assign, move and release beds" },
      { key: "inventory.read", label: "View room types, rooms, beds and blocks" },
      { key: "inventory.manage", label: "Edit room types, rooms, beds, blocks and periods" },
      { key: "pricing.manage", label: "Edit prices and deposits" },
    ],
  },
  {
    title: "Residents and check-in",
    items: [
      { key: "residents.read", label: "View the resident directory" },
      { key: "residents.read_sensitive", label: "View emergency contacts, student ID and gender" },
      { key: "residents.manage", label: "Edit or block residents" },
      { key: "checkin.manage", label: "Check-in, check-out, no-show and keys" },
    ],
  },
  {
    title: "Finance",
    items: [
      { key: "finance.read", label: "View invoices, payments and balances" },
      { key: "finance.invoice_manage", label: "Create, issue and void invoices" },
      { key: "finance.record_payment", label: "Record cash, bank and MoMo payments" },
      { key: "finance.refund_request", label: "Request a refund" },
      { key: "finance.refund_approve", label: "Approve refunds (never their own)" },
    ],
  },
  {
    title: "Operations",
    items: [
      { key: "maintenance.read", label: "View maintenance requests" },
      { key: "maintenance.manage", label: "Assign, update and close maintenance" },
      { key: "announcements.manage", label: "Publish announcements" },
      { key: "reports.read", label: "View reports" },
      { key: "reports.export", label: "Export CSV (audited)" },
      { key: "settings.read", label: "View hostel settings" },
      { key: "settings.manage", label: "Edit settings, profile and branding" },
      { key: "audit.read", label: "View the audit log" },
    ],
  },
];
