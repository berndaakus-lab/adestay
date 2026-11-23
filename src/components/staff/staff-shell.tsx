import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { MobileMenu, StaffNavLink } from "@/components/staff/section-nav";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/server/actions/auth-actions";
import type { StaffNavItem } from "@/lib/staff-nav";

interface StaffShellProps {
  tenantSlug: string;
  tenantName: string;
  roleLabel: string;
  userEmail: string | null;
  nav: StaffNavItem[];
  canSwitchHostel: boolean;
  children: ReactNode;
}

function NavList({ tenantSlug, nav }: Pick<StaffShellProps, "tenantSlug" | "nav">) {
  const groups = ["Workspace", "Operations"] as const;
  return (
    <>
      {groups.map((group) => {
        const items = nav.filter((i) => i.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group} className="mb-6">
            <p className="mb-2 px-3 text-[0.6875rem] font-bold tracking-[0.16em] text-[#aab5af] uppercase">{group}</p>
            <ul className="flex flex-col gap-1">
              {items.map((item) =>
                item.comingIn ? (
                  <li key={item.path}>
                    <span
                      aria-disabled="true"
                      className="flex min-h-11 items-center justify-between rounded-sm px-3 text-sm text-[#aab5af]"
                    >
                      {item.label}
                      <span className="text-[0.6875rem] tracking-wide uppercase">Soon</span>
                    </span>
                  </li>
                ) : (
                  <li key={item.path}>
                    <StaffNavLink href={`/t/${tenantSlug}${item.path}`} exact={item.path === ""} label={item.label} />
                  </li>
                ),
              )}
            </ul>
          </div>
        );
      })}
    </>
  );
}

/** Staff workspace frame (Figma: SideNav + portal top bar). Mobile: navigation in a disclosure. */
export function StaffShell(props: StaffShellProps) {
  const { tenantSlug, tenantName, roleLabel, userEmail, nav, canSwitchHostel, children } = props;
  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="bg-sidebar text-sidebar-foreground md:w-64 md:shrink-0">
        <div className="relative flex items-center justify-between gap-3 px-4 py-4 md:block md:px-5 md:py-6">
          <Logo inverse name="AdeStay" tagline="Hostel management" />
          <MobileMenu>
            <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-sm border border-sidebar-border px-3 text-sm">
              Menu
            </summary>
            <nav aria-label="Workspace" className="absolute right-4 left-4 z-20 mt-2 rounded-lg bg-sidebar p-3 shadow-lg">
              <NavList tenantSlug={tenantSlug} nav={nav} />
            </nav>
          </MobileMenu>
        </div>
        <nav aria-label="Workspace" className="hidden px-3 md:block">
          <NavList tenantSlug={tenantSlug} nav={nav} />
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 md:px-8">
          <div>
            <p className="text-xs text-muted-foreground">{roleLabel}</p>
            <p className="font-heading text-xl">{tenantName}</p>
          </div>
          <div className="flex items-center gap-2">
            {canSwitchHostel ? (
              <Button asChild variant="ghost" size="sm">
                <Link href="/account">Switch hostel</Link>
              </Button>
            ) : null}
            <span className="hidden text-sm text-muted-foreground sm:inline">{userEmail}</span>
            <form action={signOut}>
              <input type="hidden" name="redirectTo" value="/sign-in" />
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </header>
        <main id="main" className="flex-1 px-4 py-8 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
