import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { MoneyAmount } from "@/components/money-amount";
import { HoldTimer } from "@/components/staff/bookings/hold-timer";
import { ReviewActions } from "@/components/staff/bookings/review-actions";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { availableDecisions, todayIso, type BookingDecision } from "@/lib/booking-review";
import { hasPermission } from "@/lib/permissions";
import { formatGhanaPhone } from "@/lib/phone";
import {
  approveBooking,
  cancelBooking,
  confirmBookingHold,
  extendBookingHold,
  rejectBooking,
  startBookingReview,
  waitlistBooking,
} from "@/lib/server/actions/booking-review-actions";
import { formatEmailDate, formatEmailTime } from "@/lib/server/email/booking-templates";
import { requireStaffPage } from "@/lib/server/staff-page";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";
import { bookingRequestStatus, reservationStatus, type BookingRequestStatus, type ReservationStatus } from "@/lib/status";

export const metadata: Metadata = { title: "Review booking" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words">{children}</dd>
    </div>
  );
}

export default async function BookingReviewPage({ params }: PageProps<"/t/[tenantSlug]/reservations/[requestId]">) {
  const { tenantSlug, requestId } = await params;
  const access = await requireStaffPage(tenantSlug, `/reservations/${requestId}`, ["bookings.read"]);
  if (!UUID.test(requestId)) notFound();

  const db = await createSupabaseServerClient();
  const { data: request, error } = await db
    .from("booking_requests")
    .select("id, reference, status, resident_id, room_type_id, booking_period_id, quoted_amount_minor, quoted_deposit_minor, student_note, submitted_at, decided_at, decision_reason, cancel_reason")
    .eq("tenant_id", access.tenantId)
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error(`Could not load booking (${error.code})`);
  if (!request) notFound();

  const canSeeStudent = hasPermission(access, "residents.read");
  const [reservation, type, period, student, availability] = await Promise.all([
    db.from("reservations").select("id, status, hold_expires_at, extensions_used, confirmed_at, end_reason").eq("tenant_id", access.tenantId).eq("booking_request_id", request.id).maybeSingle(),
    db.from("room_types").select("name").eq("tenant_id", access.tenantId).eq("id", request.room_type_id).maybeSingle(),
    db.from("booking_periods").select("name, starts_on, ends_on").eq("tenant_id", access.tenantId).eq("id", request.booking_period_id).maybeSingle(),
    canSeeStudent
      ? db.from("residents").select("full_name, email, phone_e164, institution, programme, level").eq("tenant_id", access.tenantId).eq("id", request.resident_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db.rpc("room_type_availability", { p_tenant_id: access.tenantId, p_booking_period_id: request.booking_period_id }),
  ]);
  for (const result of [reservation, type, period, student, availability]) {
    if (result.error) throw new Error(`Could not load booking (${result.error.code})`);
  }

  const hold = reservation.data;
  const beds = ((availability.data ?? []) as { room_type_id: string; remaining_beds: number; overcommitted: boolean }[]).find((a) => a.room_type_id === request.room_type_id);
  const periodEnded = Boolean(period.data && period.data.ends_on < todayIso());
  const decisions = availableDecisions(
    request.status,
    hold?.status ?? null,
    { review: hasPermission(access, "bookings.review"), cancel: hasPermission(access, "bookings.cancel") },
    periodEnded,
  );
  const bind: Record<BookingDecision, typeof approveBooking> = {
    start: startBookingReview,
    approve: approveBooking,
    waitlist: waitlistBooking,
    reject: rejectBooking,
    confirm: confirmBookingHold,
    extend: extendBookingHold,
    cancel: cancelBooking,
  };
  const actions = Object.fromEntries(decisions.map((d) => [d, bind[d].bind(null, access.slug)]));
  const showHold = request.status === "approved" && hold?.status === "held";
  const s = student.data;

  return (
    <>
      <div>
        <Button asChild variant="ghost" className="-ml-3 mb-2">
          <Link href={`/t/${access.slug}/reservations`}>
            <ArrowLeft aria-hidden="true" /> All reservations
          </Link>
        </Button>
        <p className="eyebrow mb-3">Booking request</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-3xl font-semibold tracking-wide break-all md:text-4xl">{request.reference}</h1>
          <StatusBadge status={bookingRequestStatus[request.status as BookingRequestStatus]} />
          {hold ? <StatusBadge status={reservationStatus[hold.status as ReservationStatus]} /> : null}
        </div>
      </div>

      {periodEnded && ["submitted", "under_review", "waitlisted"].includes(request.status) ? (
        <Alert>
          <AlertDescription>This period has ended, so the request can no longer be approved. Please reject it with a reason so the student is told.</AlertDescription>
        </Alert>
      ) : null}
      {beds?.overcommitted ? (
        <Alert variant="destructive">
          <AlertDescription>This room type has more live bookings than available beds for this period. Check blocked or out-of-service beds.</AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="decision" className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:p-6">
        <h2 id="decision" className="text-2xl">Decision</h2>
        {showHold && hold?.hold_expires_at ? (
          <p className="flex flex-wrap items-center gap-x-2 text-sm">
            <span>Place held until {formatEmailTime(hold.hold_expires_at)}.</span>
            <HoldTimer expiresAt={hold.hold_expires_at} />
            <span className="text-muted-foreground">Extensions used: {hold.extensions_used}.</span>
          </p>
        ) : null}
        {beds && ["submitted", "under_review", "waitlisted"].includes(request.status) ? (
          <p className="text-sm">
            <span className="font-semibold tabular-nums">{beds.remaining_beds}</span> {beds.remaining_beds === 1 ? "bed" : "beds"} left for this room type and period.
          </p>
        ) : null}
        <ReviewActions requestId={request.id} reservationId={hold?.id ?? null} decisions={decisions} actions={actions} />
        {request.decision_reason ? <p className="text-sm"><span className="text-muted-foreground">Reason given to student:</span> {request.decision_reason}</p> : null}
        {request.cancel_reason ? <p className="text-sm"><span className="text-muted-foreground">Cancellation reason:</span> {request.cancel_reason}</p> : null}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="booking-details" className="rounded-lg border border-border bg-card p-4 md:p-6">
          <h2 id="booking-details" className="text-2xl">Booking</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <Fact label="Room type">{type.data?.name}</Fact>
            <Fact label="Period">{period.data?.name}{period.data ? ` (${formatEmailDate(period.data.starts_on)} to ${formatEmailDate(period.data.ends_on)})` : ""}</Fact>
            <Fact label="Price quoted"><MoneyAmount pesewas={Number(request.quoted_amount_minor)} /></Fact>
            <Fact label="Deposit quoted">{Number(request.quoted_deposit_minor) > 0 ? <MoneyAmount pesewas={Number(request.quoted_deposit_minor)} /> : "None"}</Fact>
            <Fact label="Sent">{formatEmailTime(request.submitted_at)}</Fact>
            {request.decided_at ? <Fact label="Decided">{formatEmailTime(request.decided_at)}</Fact> : null}
          </dl>
        </section>
        <section aria-labelledby="student-details" className="rounded-lg border border-border bg-card p-4 md:p-6">
          <h2 id="student-details" className="text-2xl">Student</h2>
          {s ? (
            <dl className="mt-4 grid gap-3 text-sm">
              <Fact label="Name">{s.full_name}</Fact>
              {s.phone_e164 ? <Fact label="Phone"><a className="text-primary underline decoration-brass underline-offset-4" href={`tel:${s.phone_e164}`}>{formatGhanaPhone(s.phone_e164)}</a></Fact> : null}
              {s.email ? <Fact label="Email"><a className="break-all text-primary underline decoration-brass underline-offset-4" href={`mailto:${s.email}`}>{s.email}</a></Fact> : null}
              {s.institution ? <Fact label="School or university">{s.institution}</Fact> : null}
              {s.programme ? <Fact label="Programme">{s.programme}</Fact> : null}
              {s.level ? <Fact label="Level or year">{s.level}</Fact> : null}
            </dl>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Your role does not include student details.</p>
          )}
          {request.student_note ? (
            <div className="mt-4 text-sm">
              <p className="text-muted-foreground">Student&apos;s note</p>
              <p className="whitespace-pre-line break-words">{request.student_note}</p>
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}
