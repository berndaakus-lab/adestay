# UI/UX Design System: "Modern Residence"

> Status: Phase 0 draft. Source of truth so far is the Figma Make export copied to [`design-reference/figma-make/`](../design-reference/figma-make/) (original: `Downloads\HMS - Berndaakus`). The product owner will share a **Figma design file link** later. Frames, components and variables in that file **have not been inspected yet**. See [ADR-0006](adr/0006-figma-reuse.md).

## 1. What the Figma Make export contains (inspected)

| Item | Finding |
|---|---|
| Framework | Vite 8 + React 19 + Tailwind CSS v4 (`@tailwindcss/vite`), TypeScript, pnpm. **Not Next.js.** |
| Structure | One `src/App.tsx` (496 lines) holding every screen; `src/index.css` (428 lines) of hand-written BEM-style CSS. Tailwind is imported but barely used. |
| Routing | None. Screens switch through `useState<Page>`; there are no URLs, deep links or back-button support. |
| Data | Hard-coded demo data with a US setting (Portland, `$`, `America/Los_Angeles`, `.edu` emails). No backend, auth or API calls. |
| Images | Hot-linked Unsplash URLs (licence OK for prototyping; production needs the hostel's own photos). |
| Icons | 14 inline SVG icons (Lucide-style strokes). |
| Fonts | DM Serif Display + Inter via Google Fonts `@import`. |
| Figma-specific tooling | `vite.config.ts` plugins and `.figma/make/*` scripts for the Figma Make runtime, which are not needed in production. |
| Payment UI | The student "Pay securely" form uses a "Visa ending in 4421" select. **It is a mock**: it shows card-first UX and no Mobile Money. |

### Screens present vs required (brief §11)

| # | Required interface | In export? | Notes |
|---|---|---|---|
| 1 | Public homepage | ✓ | Hero, search panel, intro, room cards, amenities, footer |
| 2 | Room listings / details | Listings ✓, **details ✗** | No room-type detail page |
| 3 | Availability & booking request | ✓ (2-step form) | Search panel is static (not real inputs); needs period selection |
| 4 | Booking lookup | ✓ | |
| 5 | Booking confirmation | ✓ | Copy already explains "room-type request, not a bed" |
| 6 | Admin dashboard | ✓ | Stats + reservation table |
| 7 | Reservation review & bed allocation | ✓ | Side panel with decision + bed select |
| 8 | Room & bed inventory | Partial | Bed map overview; no CRUD forms |
| 9 | Resident directory & profiles | Directory ✓, profile ✗ | |
| 10 | Check-in / check-out | Partial (kanban) | No check-in form/checklist |
| 11 | Invoices & payments | Partial | Stats + table; no invoice detail, manual payment form |
| 12 | Maintenance management (admin) | ✗ | Only the student-side form exists |
| 13 | Reports | ✓ (sample) | |
| 14 | Branding & settings | Partial | Profile form; tabs for rules/staff/notifications are stubs |
| 15 | Student portal | ✓ | Overview with status progress |
| 16 | Student booking & allocation | ✓ | |
| 17 | Student invoices/receipts | ✓ | Needs MoMo-first payment UX |
| 18 | Student maintenance & profile | ✓ | |
| 19 | Platform dashboard | ✓ | |
| 20 | Tenant management & domains | Partial | Directory only; no create/domain-config flow |
| 21 | Auth, password recovery, errors | ✗ | |

**Gaps to design:** room detail; staff and resident profile pages; inventory CRUD; check-in form; invoice detail; manual payment recording; MoMo payment flow; admin maintenance board; staff and permission management; tenant onboarding and domain setup; auth screens (OTP code entry, password, MFA enrolment, recovery); 404, 403, suspended-hostel and maintenance pages; and loading/empty/error states for every list.

### Accessibility findings in the export
- `.search-panel` "fields" are `<label>`s wrapping static text, not form controls.
- Navigation uses `<button>`s instead of links, so there is no URL, no middle-click and no history.
- Focus styles cover `button` and `input` only, not `select`, `textarea` or `a`.
- Checkbox task lists look interactive but do nothing.
- The mobile menu toggles but has no focus trap or `aria-expanded`.
- **Contrast** (WCAG 2.x relative-luminance ratios, computed 2026-10-11):

| Pair | Ratio | Result |
|---|---|---|
| Forest `#234536` on Ivory `#F7F5EF` | 9.75 : 1 | ✓ AA/AAA |
| Charcoal `#292D2A` on Ivory | 12.82 : 1 | ✓ |
| Olive `#68765A` on Ivory | 4.45 : 1 | ✗ for normal text (AA needs 4.5). Used for 11 px eyebrow labels. |
| Muted `#70766F` on Ivory | 4.27 : 1 | ✗ for body text; ✓ on white (4.66) |
| Brass `#B69A61` on Ivory | 2.47 : 1 | ✗ for any text; decorative/borders only |
| White on Forest | 10.63 : 1 | ✓ |

## 2. Design tokens

Defined once as CSS variables in Tailwind v4 `@theme`, consumed by shadcn/ui. Per-tenant brand colours override **only** `--brand` and `--brand-contrast`, and are validated for ≥ 4.5 : 1 against their text colour.

| Token | Value | Use |
|---|---|---|
| `--ivory` | `#F7F5EF` | Page background |
| `--paper` | `#FFFFFF` | Cards, panels, inputs |
| `--forest` | `#234536` | Primary actions, headings accent (platform default `--brand`) |
| `--forest-deep` | `#183329` | Hover, footer, admin sidebar |
| `--olive` | `#68765A` | Large text, icons, chips **only** |
| `--olive-text` *(new)* | `#56634A` (5.87 : 1 on ivory) | Eyebrows/small labels |
| `--brass` | `#B69A61` | Hairlines and decorative accents only (fails 3:1) |
| `--brass-strong` *(new)* | `#7A5E26` | Focus ring (≥ 3:1 on ivory and white) |
| `--charcoal` | `#292D2A` | Body text |
| `--muted` | `#70766F` | Secondary text on white only |
| `--muted-strong` *(new)* | `#5E645D` (5.57 : 1 on ivory) | Secondary text on ivory |
| `--line` | `#DEDFD9` | Borders, dividers |
| `--line-strong` *(new)* | `#858A83` | Input and control borders (≥ 3:1, WCAG 1.4.11) |
| `--success` / `--success-bg` | `#3E6B4F` / `#E8F0E9` | Status: approved/paid |
| `--warning` / `--warning-bg` | `#7A5A24` / `#F5EDDA` | Status: pending/due (darkened from `#8A652A` for margin above 4.5:1) |
| `--danger` / `--danger-bg` *(new)* | `#9B2C2C` / `#F8E7E5` | Errors, overdue, rejected |
| `--info` / `--info-bg` *(new)* | `#2F5D74` / `#E6EFF3` | Neutral notices |
| Radius | `2px` controls, `4px` cards | Restrained; avoid pill-heavy UI |
| Shadow | `0 1px 2px rgb(26 37 31 / .06)`; overlay `0 20px 50px rgb(26 37 31 / .18)` | |
| Spacing | 4-px base; section rhythm 64/96/128 px desktop, 40/56 px mobile | |

### Typography
| Role | Font | Size (mobile → desktop) |
|---|---|---|
| Display (h1 hero) | DM Serif Display 400 | 40 → 96 px, `clamp()` |
| h1 page | DM Serif Display | 34 → 64 px |
| h2 | DM Serif Display | 28 → 44 px |
| h3 | DM Serif Display | 22 → 28 px |
| UI / body | Inter 400/500/600 | 15–16 px body, 14 px UI, 12 px meta |
| Eyebrow | Inter 700, uppercase, `.16em` tracking | 11–12 px, `--olive-text` |
| Numbers | Inter with `tabular-nums` | Money and tables |

Fonts are self-hosted through `next/font` (no runtime Google Fonts `@import`), which is better for performance and privacy.

## 3. Components (shadcn/ui restyled + domain components)
- **Primitives (shadcn):** Button (primary/secondary/ghost/link/destructive), Input, Select, Textarea, Checkbox, RadioGroup, Dialog, Sheet (mobile nav, allocation panel on mobile), DropdownMenu, Tabs, Table, Badge, Toast (Sonner), Skeleton, Form (react-hook-form + Zod), Calendar/DatePicker, Command (search).
- **Domain:** `RoomTypeCard`, `AvailabilityBadge`, `PeriodPicker`, `BookingTimeline` (request → approved → paid → bed → checked in), `StatusBadge` (single map from state → colour/label), `MoneyAmount` (GH₵ formatting), `PhoneInput` (+233 normalisation), `BedMap`, `AllocationPanel`, `InvoiceSummary`, `MomoPayButton`, `EmptyState`, `ErrorState`, `StatTile`, `DataTable` (server-paginated).

## 4. Interaction and state standards
- Every data view has **loading** (skeleton), **empty** (explains next action), **error** (retry and correlation id) and **success** states.
- Forms:
  - Labels are always visible.
  - Inline validation on blur, with a summary on submit.
  - The submit button shows progress and is disabled during submission.
  - Idempotent submits.
- Destructive or irreversible actions (reject, cancel, void, refund) use a confirmation dialog with a required reason.
- Money is always `GH₵ 1,250.00` with tabular numerals. Dates are `24 Aug 2026` and times use 24-hour or `9:00 am` per tenant setting.
- **Mobile-first:**
  - Public pages are designed at 360 px first.
  - Tap targets are ≥ 44 px.
  - The admin data table collapses to cards under 768 px.
- **Accessibility** (WCAG 2.2 AA):
  - Semantic links for navigation.
  - Visible brass focus ring on *all* interactive elements.
  - `aria-live` for async status (payment confirmation).
  - Reduced-motion respected.
  - Forms are fully keyboard-navigable.
- **Performance:**
  - `next/image` with responsive sizes and AVIF/WebP.
  - Public pages are server-rendered/ISR with minimal client JS.
  - Photos are lazy-loaded below the fold.

## 5. Avoid (from the brief)
Generic AI gradients, heavy rounded "bubble" cards, cluttered dashboards with decorative metrics, mixed type families, and decoration that reduces usability. The export's single hero gradient overlay (for text legibility on photos) is acceptable.

## 6. Ghana localisation of the design
- Replace Portland/US copy, `$` and `.edu` with Ghanaian context: GH₵, `+233`, universities, landmarks, Ghana Post GPS.
- **MoMo-first payment UI:** network selection (MTN MoMo, Telecel Cash, AT Money), phone entry, a "approve the prompt on your phone" waiting state with a timeout and a retry. Card is a secondary option.
- Make "Call / WhatsApp the hostel" contact actions prominent.

## 7. What is needed from the product owner
1. **Figma design file link** (with view access), or an export of frames as PNG/PDF, plus the variables/styles if defined. I will compare it against this inventory and update the gaps list.
2. Confirmation of whether the Figma file has screens beyond the Make export (especially auth, room detail, maintenance admin, tenant onboarding).
3. The first customer's real logo, photos and brand colour (or approval to use the Forest default).
