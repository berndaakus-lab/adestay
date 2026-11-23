import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { HoldTimer } from "@/components/staff/bookings/hold-timer";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { referenceSearch, REVIEW_TABS, reviewTab, todayIso } from "@/lib/booking-review";
import { hasPermission } from "@/lib/permissions";
import { firstParam } from "@/lib/search-params";
import { formatEmailDate } from "@/lib/server/email/booking-templates";
import { requireStaffPage } from "@/lib/server/staff-page";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";
import { bookingRequestStatus, reservationStatus, type BookingRequestStatus, type ReservationStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Reservations" };

const PAGE_SIZE = 50;

export default async function ReservationsPage({ params, searchParams }: PageProps<"/t/[tenantSlug]/reservations">) {
  const { tenantSlug } = await params;
  const access = await requireStaffPage(tenantSlug, "/reservations", ["bookings.read"]);
  const query = await searchParams;
  const tab = reviewTab(firstParam(query.view));
  const search = referenceSearch(firstParam(query.q));
  const page = Math.max(1, Math.min(10_000, Number.parseInt(firstParam(query.page) ?? "1", 10) || 1));
  const base = `/t/${access.slug}/reservations`;
  const canSeeStudents = hasPermission(access, "residents.read");

  const db = await createSupabaseServerClient();
  let list = db
    .from("booking_requests")
    .select("id, reference, status, resident_id, room_type_id, booking_period_id, submitted_at", { count: "exact" })
    .eq("tenant_id", access.tenantId)
    .in("status", [...tab.statuses]);
  if (search) list = list.ilike("reference", `%${search}%`);
  // Oldest first while waiting for a decision; newest first once closed.
  list = list.order("submitted_at", { ascending: tab.key !== "closed" }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const [requests, periods, types, ...counts] = await Promise.all([
    list,
    db.from("booking_periods").select("id, name, ends_on, booking_closes_at").eq("tenant_id", access.tenantId),
    db.from("room_types").select("id, name").eq("tenant_id", access.tenantId),
    ...REVIEW_TABS.map((t) =>
      db.from("booking_requests").select("id", { count: "exact", head: true }).eq("tenant_id", access.tenantId).in("status", [...t.statuses]),
    ),
  ]);
  for (const result of [requests, periods, types, ...counts]) {
    if (result.error) throw new Error(`Could not load reservations (${result.error.code})`);
  }

  const rows = requests.data ?? [];
  const ids = rows.map((r) => r.id);
  const residentIds = [...new Set(rows.map((r) => r.resident_id))];
  const [holds, students] = await Promise.all([
    ids.length
      ? db.from("reservations").select("booking_request_id, status, hold_expires_at").eq("tenant_id", access.tenantId).in("booking_request_id", ids)
      : Promise.resolve({ data: [], error: null }),
    canSeeStudents && residentIds.length
      ? db.from("residents").select("id, full_name").eq("tenant_id", access.tenantId).in("id", residentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (holds.error || students.error) throw new Error(`Could not load reservations (${(holds.error ?? students.error)?.code})`);

  const today = todayIso();
  const now = new Date().toISOString();
  const lines = rows.map((row) => {
    const period = periods.data?.find((p) => p.id === row.booking_period_id);
    const hold = (holds.data ?? []).find((h) => h.booking_request_id === row.id);
    const waiting = row.status === "submitted" || row.status === "under_review" || row.status === "waitlisted";
    const note = !waiting || !period ? null : period.ends_on < today ? "Period ended" : period.booking_closes_at && period.booking_closes_at <= now ? "Booking closed" : null;
    return {
      ...row,
      href: `${base}/${row.id}`,
      student: (students.data ?? []).find((s) => s.id === row.resident_id)?.full_name ?? null,
      room: types.data?.find((t) => t.id === row.room_type_id)?.name ?? "Room type",
      period: period?.name ?? "Period",
      note,
      badge: bookingRequestStatus[row.status as BookingRequestStatus],
      holdBadge: hold && row.status === "approved" ? reservationStatus[hold.status as ReservationStatus] : null,
      holdEnds: hold?.status === "held" && row.status === "approved" ? (hold.hold_expires_at as string) : null,
    };
  });
  const total = requests.count ?? 0;
  const pageHref = (n: number) => `${base}?view=${tab.key}${search ? `&q=${encodeURIComponent(search)}` : ""}&page=${n}`;

  return (
    <>
      <div>
        <p className="eyebrow mb-3">Bookings</p>
        <h1 className="text-4xl">Reservations</h1>
      </div>

      <nav aria-label="Booking status" className="-mx-1 overflow-x-auto">
        <ul className="flex min-w-max gap-1 border-b border-border px-1">
          {REVIEW_TABS.map((t, index) => (
            <li key={t.key}>
              <Link
                href={`${base}?view=${t.key}`}
                aria-current={t.key === tab.key ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2 border-b-2 border-transparent px-3 text-sm text-muted-strong hover:text-foreground",
                  t.key === tab.key && "border-primary font-semibold text-foreground",
                )}
              >
                {t.label} <span className="tabular-nums">({counts[index].count ?? 0})</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <form method="get" action={base} role="search" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="view" value={tab.key} />
        <div className="flex min-w-48 flex-1 flex-col gap-2 sm:max-w-xs">
          <Label htmlFor="booking-search">Find by reference</Label>
          <Input id="booking-search" name="q" defaultValue={search ?? ""} maxLength={20} autoComplete="off" />
        </div>
        <Button type="submit" variant="outline">Search</Button>
        {search ? (
          <Button asChild variant="ghost">
            <Link href={`${base}?view=${tab.key}`}>Clear</Link>
          </Button>
        ) : null}
      </form>

      <section className="rounded-lg border border-border bg-card p-4 md:p-6" aria-label={`${tab.label} bookings`}>
        {lines.length ? (
          <>
            <ul className="flex flex-col divide-y divide-border md:hidden">
              {lines.map((line) => (
                <li key={line.id} className="flex flex-col gap-1 py-3 text-sm">
                  <span className="flex items-start justify-between gap-2">
                    <Link href={line.href} className="inline-flex min-h-11 items-center font-mono font-semibold text-primary underline decoration-brass underline-offset-4">
                      {line.reference}
                    </Link>
                    <StatusBadge status={line.holdBadge ?? line.badge} />
                  </span>
                  {line.student ? <span className="font-medium break-words">{line.student}</span> : null}
                  <span className="break-words text-muted-foreground">{line.room} · {line.period}</span>
                  <span className="text-muted-foreground">Sent {formatEmailDate(line.submitted_at)}</span>
                  {line.note ? <span className="font-semibold text-warning">{line.note}</span> : null}
                  {line.holdEnds ? <HoldTimer expiresAt={line.holdEnds} /> : null}
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    {canSeeStudents ? <TableHead>Student</TableHead> : null}
                    <TableHead>Room and period</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        <Link href={line.href} className="font-mono font-semibold text-primary underline decoration-brass underline-offset-4">
                          {line.reference}
                        </Link>
                      </TableCell>
                      {canSeeStudents ? <TableCell className="max-w-40 truncate">{line.student}</TableCell> : null}
                      <TableCell className="max-w-56 whitespace-normal">{line.room}<br /><span className="text-muted-foreground">{line.period}</span></TableCell>
                      <TableCell>{formatEmailDate(line.submitted_at)}</TableCell>
                      <TableCell>
                        <span className="flex flex-col items-start gap-1">
                          <StatusBadge status={line.holdBadge ?? line.badge} />
                          {line.note ? <span className="text-xs font-semibold text-warning">{line.note}</span> : null}
                          {line.holdEnds ? <HoldTimer expiresAt={line.holdEnds} className="text-xs" /> : null}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {total > PAGE_SIZE ? (
              <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-2 text-sm">
                {page > 1 ? <Button asChild variant="outline"><Link href={pageHref(page - 1)}>Previous</Link></Button> : <span />}
                <span>Page {page} of {Math.ceil(total / PAGE_SIZE)}</span>
                {page * PAGE_SIZE < total ? <Button asChild variant="outline"><Link href={pageHref(page + 1)}>Next</Link></Button> : <span />}
              </nav>
            ) : null}
          </>
        ) : (
          <EmptyState
            icon={<ClipboardList />}
            title={search ? "No booking with that reference here" : `Nothing in ${tab.label.toLowerCase()}`}
            description={search ? "Check the reference, or look in another tab." : "New requests appear here when students book on your website."}
          />
        )}
      </section>
    </>
  );
}
