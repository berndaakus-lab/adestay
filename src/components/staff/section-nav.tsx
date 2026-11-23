"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";

/** The phone menu. The shell survives navigation, so choosing a link must close it. */
export function MobileMenu({ children }: { children: ReactNode }) {
  const menu = useRef<HTMLDetailsElement>(null);
  return (
    <details
      ref={menu}
      className="md:hidden"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a") && menu.current) menu.current.open = false;
      }}
    >
      {children}
    </details>
  );
}

/** A link in the workspace menu. Overview matches exactly; sections also match their sub-pages. */
export function StaffNavLink({ href, exact, label }: { href: string; exact: boolean; label: string }) {
  const pathname = usePathname();
  const current = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className="flex min-h-11 items-center rounded-sm px-3 text-sm text-white hover:bg-sidebar-accent aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-semibold"
    >
      {label}
    </Link>
  );
}

export function SectionNav({ label, items }: { label: string; items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max gap-1 border-b border-border px-1">
        {items.map((item, index) => (
          <li key={item.href}>
            <Link
              href={item.href}
              // The first tab is the section's root, so only an exact match counts for it.
              aria-current={pathname === item.href || (index > 0 && pathname.startsWith(`${item.href}/`)) ? "page" : undefined}
              className="flex min-h-11 items-center border-b-2 border-transparent px-3 text-sm text-muted-strong hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
