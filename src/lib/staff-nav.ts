import { hasPermission, type Permission, type TenantAccess } from "@/lib/permissions";

/**
 * Staff workspace navigation (Figma SideNav: Overview, Reservations, Rooms & beds, Residents,
 * Check-in, Payments, Reports, Settings). Items are shown only to staff whose permissions allow
 * them; sections not built yet are marked with the phase that delivers them.
 */
export interface StaffNavItem {
  label: string;
  /** Path below /t/{tenantSlug}. */
  path: string;
  group: "Workspace" | "Operations";
  /** Any one of these permissions shows the item. Omitted: every member sees it. */
  anyOf?: Permission[];
  /** Set while the section is not built yet. */
  comingIn?: string;
}

/** Who can open the inventory area. Staff with pricing.manage alone reach Periods, Room types and Prices. */
export const INVENTORY_PAGE_PERMISSIONS: Permission[] = ["inventory.read", "inventory.manage", "pricing.manage"];

export const STAFF_NAV: StaffNavItem[] = [
  { label: "Overview", path: "", group: "Workspace" },
  { label: "Reservations", path: "/reservations", group: "Workspace", anyOf: ["bookings.read"], comingIn: "Phase 3" },
  { label: "Rooms & beds", path: "/inventory", group: "Workspace", anyOf: INVENTORY_PAGE_PERMISSIONS },
  { label: "Residents", path: "/residents", group: "Workspace", anyOf: ["residents.read"], comingIn: "Phase 4" },
  { label: "Check-in", path: "/check-in", group: "Operations", anyOf: ["checkin.manage"], comingIn: "Phase 4" },
  { label: "Payments", path: "/payments", group: "Operations", anyOf: ["finance.read"], comingIn: "Phase 5" },
  { label: "Maintenance", path: "/maintenance", group: "Operations", anyOf: ["maintenance.read"], comingIn: "Phase 6" },
  { label: "Reports", path: "/reports", group: "Operations", anyOf: ["reports.read"], comingIn: "Phase 6" },
  { label: "Settings", path: "/settings", group: "Operations", anyOf: ["settings.read", "settings.manage", "staff.manage"] },
];

export function visibleStaffNav(access: TenantAccess): StaffNavItem[] {
  return STAFF_NAV.filter((item) => !item.anyOf || item.anyOf.some((p) => hasPermission(access, p)));
}
