import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { BedDouble, Info, SearchX } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { EmptyState } from "@/components/empty-state";
import { MoneyAmount } from "@/components/money-amount";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  bookingRequestStatus,
  bedAllocationStatus,
  invoiceStatus,
  paymentStatus,
  reservationStatus,
} from "@/lib/status";
import { InteractiveDemos } from "./interactive-demos";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

const palette: Array<{ name: string; token: string; note: string; dark?: boolean }> = [
  { name: "Ivory", token: "--ivory", note: "Page background" },
  { name: "Paper", token: "--paper", note: "Cards, inputs" },
  { name: "Forest", token: "--forest", note: "Primary actions", dark: true },
  { name: "Forest deep", token: "--forest-deep", note: "Hover, sidebar", dark: true },
  { name: "Olive", token: "--olive", note: "Icons, large text", dark: true },
  { name: "Olive text", token: "--olive-text", note: "Small labels", dark: true },
  { name: "Brass", token: "--brass", note: "Decorative only" },
  { name: "Brass strong", token: "--brass-strong", note: "Focus ring", dark: true },
  { name: "Charcoal", token: "--charcoal", note: "Body text", dark: true },
  { name: "Muted strong", token: "--muted-strong", note: "Secondary text", dark: true },
  { name: "Line", token: "--line", note: "Borders" },
  { name: "Line strong", token: "--line-strong", note: "Input borders", dark: true },
];

const statusTones: Array<{ name: string; fg: string; bg: string }> = [
  { name: "Success", fg: "--success", bg: "--success-bg" },
  { name: "Warning", fg: "--warning", bg: "--warning-bg" },
  { name: "Danger", fg: "--danger", bg: "--danger-bg" },
  { name: "Info", fg: "--info", bg: "--info-bg" },
];

const requests = [
  { ref: "ALD-7K3Q9P", name: "Ama Mensah", room: "Twin room", amount: 59_000, status: bookingRequestStatus.under_review },
  { ref: "ALD-2M8X4R", name: "Kwame Owusu", room: "Single room", amount: 76_000, status: bookingRequestStatus.approved },
  { ref: "ALD-9T6F1D", name: "Efua Asante", room: "Four-in-a-room", amount: 42_000, status: bookingRequestStatus.waitlisted },
  { ref: "ALD-5H2Z7B", name: "Yaw Boateng", room: "Single room", amount: 76_000, status: bookingRequestStatus.rejected },
];

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-6 py-10">
      <div>
        <p className="eyebrow mb-3">{eyebrow}</p>
        <h2 className="text-3xl md:text-4xl">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function DesignSystemPage() {
  // Internal reference page: never served on the production site.
  if (process.env.VERCEL_ENV === "production") notFound();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 md:px-10">
      <header className="flex flex-col gap-6 border-b border-border py-10 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-5">
          <Logo />
          <div>
            <p className="eyebrow mb-3">Modern Residence</p>
            <h1 className="text-4xl md:text-6xl">Design system</h1>
          </div>
        </div>
        <p className="max-w-md text-sm text-muted-foreground">
          Every colour, type style and component used across AdeStay. Colour pairs on this page are checked against
          WCAG AA by the unit tests.
        </p>
      </header>

      <Section eyebrow="Tokens" title="Colour">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {palette.map((c) => (
            <div key={c.token} className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="h-16" style={{ background: `var(${c.token})` }} />
              <div className="p-3">
                <p className="text-sm font-semibold">{c.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{c.token}</p>
                <p className="mt-1 text-xs text-muted-foreground">{c.note}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {statusTones.map((t) => (
            <div
              key={t.name}
              className="rounded-lg p-4 text-sm font-semibold"
              style={{ background: `var(${t.bg})`, color: `var(${t.fg})` }}
            >
              {t.name} text on its background
            </div>
          ))}
        </div>
      </Section>

      <Separator />

      <Section eyebrow="Tokens" title="Typography">
        <div className="flex flex-col gap-5">
          <p className="font-heading text-5xl md:text-7xl">A place to belong.</p>
          <h1 className="text-4xl md:text-6xl">Page heading, DM Serif Display</h1>
          <h2 className="text-3xl md:text-4xl">Section heading</h2>
          <h3 className="text-2xl">Card heading</h3>
          <p className="eyebrow">Eyebrow label · olive text</p>
          <p className="max-w-2xl text-base">
            Body text is Inter at 16px. It stays readable on mid-range Android phones and over slow mobile data,
            because both fonts are self-hosted with the app.
          </p>
          <p className="text-sm text-muted-foreground">Secondary text, 14px, muted.</p>
          <p className="text-2xl font-semibold">
            <MoneyAmount pesewas={125_000} /> <span className="text-sm font-normal text-muted-foreground">tabular figures</span>
          </p>
        </div>
      </Section>

      <Separator />

      <Section eyebrow="Components" title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Check availability</Button>
          <Button variant="outline">View all rooms</Button>
          <Button variant="secondary">Export</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="destructive">Void invoice</Button>
          <Button variant="link">Find my booking</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button>Default (44px)</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" aria-label="Beds">
            <BedDouble />
          </Button>
        </div>
      </Section>

      <Separator />

      <Section eyebrow="Components" title="Forms">
        <div className="grid gap-6 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="ds-name">Full name</FieldLabel>
            <Input id="ds-name" placeholder="Ama Mensah" autoComplete="name" />
          </Field>
          <Field>
            <FieldLabel htmlFor="ds-phone">Phone number</FieldLabel>
            <Input id="ds-phone" type="tel" inputMode="tel" placeholder="024 123 4567" autoComplete="tel" />
            <FieldDescription>We accept 0XX numbers and convert them to +233.</FieldDescription>
          </Field>
          <Field data-invalid>
            <FieldLabel htmlFor="ds-email">Email address</FieldLabel>
            <Input id="ds-email" type="email" defaultValue="ama.mensah@" aria-invalid aria-describedby="ds-email-error" />
            <FieldError id="ds-email-error">Enter a full email address, e.g. ama@example.com</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="ds-room">Room type</FieldLabel>
            <Select>
              <SelectTrigger id="ds-room" className="w-full">
                <SelectValue placeholder="Choose a room type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single room</SelectItem>
                <SelectItem value="twin">Twin room</SelectItem>
                <SelectItem value="four">Four-in-a-room</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field orientation="horizontal" className="md:col-span-2">
            <Checkbox id="ds-terms" />
            <FieldLabel htmlFor="ds-terms" className="font-normal">
              I confirm my details are correct and accept the hostel&apos;s booking terms.
            </FieldLabel>
          </Field>
        </div>
      </Section>

      <Separator />

      <Section eyebrow="Components" title="Status">
        <div className="flex flex-col gap-4">
          {[
            ["Booking request", bookingRequestStatus],
            ["Place hold", reservationStatus],
            ["Bed", bedAllocationStatus],
            ["Invoice", invoiceStatus],
            ["Payment", paymentStatus],
          ].map(([label, map]) => (
            <div key={label as string} className="flex flex-col gap-2 md:flex-row md:items-center">
              <p className="w-40 shrink-0 text-sm font-semibold">{label as string}</p>
              <div className="flex flex-wrap gap-2">
                {Object.values(map as typeof bookingRequestStatus).map((s) => (
                  <StatusBadge key={s.label} status={s} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Separator />

      <Section eyebrow="Components" title="Cards, tables and alerts">
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <p className="eyebrow">Twin room · Shared bath</p>
              <CardTitle className="font-heading text-2xl font-normal">The Courtyard Twin</CardTitle>
              <CardDescription>2 students per room · Academic year 2026/27</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <span className="font-semibold">
                <MoneyAmount pesewas={59_000} />
              </span>
              <Badge variant="warning">Limited</Badge>
            </CardContent>
            <CardFooter>
              <Button className="w-full">Request this room</Button>
            </CardFooter>
          </Card>
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="font-heading text-2xl font-normal">Booking requests</CardTitle>
              <CardDescription>Approve a request before assigning a specific bed.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Room type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((r) => (
                    <TableRow key={r.ref}>
                      <TableCell>
                        <span className="block font-semibold">{r.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{r.ref}</span>
                      </TableCell>
                      <TableCell>{r.room}</TableCell>
                      <TableCell className="text-right">
                        <MoneyAmount pesewas={r.amount} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Alert>
            <Info />
            <AlertTitle>Your place is held until 21 August</AlertTitle>
            <AlertDescription>Pay the deposit before then to confirm your booking.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <Info />
            <AlertTitle>Payment not confirmed</AlertTitle>
            <AlertDescription>We could not verify this payment yet. You have not been charged twice.</AlertDescription>
          </Alert>
        </div>
      </Section>

      <Separator />

      <Section eyebrow="States" title="Loading, empty and feedback">
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardContent className="flex flex-col gap-3">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-11 w-40" />
            </CardContent>
          </Card>
          <Card>
            <EmptyState
              icon={<SearchX />}
              title="No requests found"
              description="Try another name or booking reference, or clear the status filter."
              action={<Button variant="outline">Clear filters</Button>}
            />
          </Card>
        </div>
        <InteractiveDemos />
      </Section>

      <Separator />

      <Section eyebrow="Brand" title="Logo">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-8">
            <Logo />
          </div>
          <div className="rounded-lg bg-forest-deep p-8">
            <Logo inverse name="Alder House" tagline="Student residence" />
          </div>
        </div>
      </Section>
    </main>
  );
}
