import { useState, type ReactNode } from "react";

type Page = "home" | "rooms" | "booking" | "lookup" | "admin" | "student" | "platform";
type AdminView = "overview" | "reservations" | "inventory" | "residents" | "checkin" | "payments" | "reports" | "settings";
type StudentView = "overview" | "booking" | "payments" | "support" | "profile";
type IconName =
  | "arrow"
  | "bed"
  | "calendar"
  | "check"
  | "chevron"
  | "clock"
  | "close"
  | "door"
  | "download"
  | "home"
  | "menu"
  | "people"
  | "search"
  | "wallet";

const photos = {
  hero: "https://images.unsplash.com/photo-1635321349359-333da6bb6da9?auto=format&fit=crop&w=1800&q=85",
  private:
    "https://images.unsplash.com/photo-1663811397207-418a92396ad5?auto=format&fit=crop&w=1000&q=80",
  studio:
    "https://images.unsplash.com/photo-1663811397091-9a13493eff11?auto=format&fit=crop&w=1000&q=80",
  shared:
    "https://images.unsplash.com/photo-1663811397236-731fb210c817?auto=format&fit=crop&w=1000&q=80",
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    bed: <><path d="M2 4v16" /><path d="M2 14h20v6" /><path d="M6 10h12a4 4 0 0 1 4 4H2a4 4 0 0 1 4-4Z" /><path d="M6 10V7h5v3" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    door: <><path d="M4 21h16M6 21V3h12v18M14 12h.01" /></>,
    download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" /></>,
    home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v11h14V10M9 21v-7h6v7" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    wallet: <><path d="M4 6h15a2 2 0 0 1 2 2v11H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14" /><path d="M16 12h5" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function Button({
  children,
  variant = "primary",
  onClick,
  className = "",
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "text";
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button className={`button button--${variant} ${className}`} onClick={onClick}>
      {children}
    </button>
  );
}

function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className={`logo ${inverse ? "logo--inverse" : ""}`} aria-label="Alder House Student Residence">
      <span className="logo__mark">A</span>
      <span><strong>Alder House</strong><small>Student Residence</small></span>
    </div>
  );
}

function PublicHeader({ goTo }: { goTo: (page: Page) => void }) {
  const [open, setOpen] = useState(false);
  const navigate = (page: Page) => {
    goTo(page);
    setOpen(false);
  };
  return (
    <header className="public-header">
      <Logo />
      <nav className={`public-nav ${open ? "public-nav--open" : ""}`} aria-label="Main navigation">
        <button onClick={() => navigate("rooms")}>Rooms</button>
        <button onClick={() => navigate("home")}>Life at Alder</button>
        <button onClick={() => navigate("lookup")}>Find booking</button>
        <button onClick={() => navigate("student")}>Student portal</button>
        <button onClick={() => navigate("admin")}>Staff portal</button>
        <Button onClick={() => navigate("rooms")}>Check availability</Button>
      </nav>
      <button className="menu-button" onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "Open menu"}>
        <Icon name={open ? "close" : "menu"} />
      </button>
    </header>
  );
}

const rooms = [
  { name: "The Courtyard Single", detail: "Private room · Shared bath", price: "from $760 / month", photo: photos.private, tag: "Most popular" },
  { name: "The Garden Studio", detail: "Private studio · Ensuite", price: "from $1,120 / month", photo: photos.studio, tag: "2 left" },
  { name: "The Twin Residence", detail: "Two students · Shared bath", price: "from $590 / month", photo: photos.shared, tag: "Best value" },
];

function SearchPanel({ onSearch }: { onSearch: () => void }) {
  return (
    <div className="search-panel" aria-label="Availability search">
      <label><span>Move in</span><span className="field-value"><Icon name="calendar" /> Aug 24, 2026</span></label>
      <label><span>Duration</span><span className="field-value"><Icon name="clock" /> Academic year</span></label>
      <label><span>Room type</span><span className="field-value"><Icon name="bed" /> Any room</span></label>
      <Button onClick={onSearch}><Icon name="search" /> Find a room</Button>
    </div>
  );
}

function HomePage({ goTo }: { goTo: (page: Page) => void }) {
  return (
    <div>
      <PublicHeader goTo={goTo} />
      <main>
        <section className="hero">
          <img src={photos.hero} alt="Warm, light-filled suite at Alder House" />
          <div className="hero__shade" />
          <div className="hero__content">
            <p className="eyebrow eyebrow--light">Thoughtful student living · Portland</p>
            <h1>A place to live.<br />A place to belong.</h1>
            <p>Beautifully considered rooms, welcoming shared spaces, and a community that feels like home.</p>
          </div>
          <SearchPanel onSearch={() => goTo("rooms")} />
        </section>

        <section className="intro content-section">
          <div>
            <p className="eyebrow">Modern residence</p>
            <h2>More than a room for the year</h2>
          </div>
          <div>
            <p className="intro__copy">Alder House brings together calm private spaces, considered amenities, and an easygoing community—minutes from campus and everything Portland has to offer.</p>
            <button className="text-link" onClick={() => goTo("rooms")}>Discover life at Alder <Icon name="arrow" /></button>
          </div>
        </section>

        <section className="rooms-section content-section">
          <div className="section-heading">
            <div><p className="eyebrow">Find your space</p><h2>Rooms made for real life</h2></div>
            <Button variant="secondary" onClick={() => goTo("rooms")}>Explore all rooms <Icon name="arrow" /></Button>
          </div>
          <div className="room-grid">
            {rooms.map((room) => <RoomCard room={room} key={room.name} onClick={() => goTo("rooms")} />)}
          </div>
        </section>

        <section className="amenities content-section">
          <div className="amenities__image"><img src={photos.studio} alt="Bright private room with garden view" /></div>
          <div className="amenities__copy">
            <p className="eyebrow eyebrow--light">Everything you need</p>
            <h2>Living, made effortless</h2>
            <p>From quiet corners for focus to shared spaces made for connection, every detail supports your best year yet.</p>
            <ul>
              <li><Icon name="check" /> High-speed Wi-Fi throughout</li>
              <li><Icon name="check" /> Utilities and weekly cleaning included</li>
              <li><Icon name="check" /> 24/7 secure access and on-site team</li>
            </ul>
          </div>
        </section>
      </main>
      <footer><Logo inverse /><p>Independent student living in the heart of Portland.</p><small>© 2026 Alder House Residence · Demo experience</small></footer>
    </div>
  );
}

function RoomCard({ room, onClick }: { room: typeof rooms[number]; onClick: () => void }) {
  return (
    <article className="room-card">
      <div className="room-card__image"><img src={room.photo} alt={room.name} /><span>{room.tag}</span></div>
      <div className="room-card__body">
        <p>{room.detail}</p><h3>{room.name}</h3>
        <div><strong>{room.price}</strong><button onClick={onClick} aria-label={`View ${room.name}`}><Icon name="arrow" /></button></div>
      </div>
    </article>
  );
}

function RoomsPage({ goTo }: { goTo: (page: Page) => void }) {
  const [filter, setFilter] = useState("All rooms");
  return (
    <div>
      <PublicHeader goTo={goTo} />
      <main className="rooms-page">
        <section className="page-intro content-section">
          <p className="eyebrow">Alder House · Portland</p>
          <h1>Find a room that feels like yours</h1>
          <p>Flexible, fully furnished spaces for the 2026–27 academic year.</p>
        </section>
        <div className="content-section"><SearchPanel onSearch={() => undefined} /></div>
        <section className="listing content-section">
          <div className="filter-row">
            <p><strong>6 room types</strong> available for your dates</p>
            <div>{["All rooms", "Private", "Shared"].map((item) => <button className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div>
          </div>
          <div className="room-grid">
            {rooms.filter((r) => filter === "All rooms" || (filter === "Private" ? !r.detail.includes("Two") : r.detail.includes("Two"))).map((room) =>
              <RoomCard room={room} key={room.name} onClick={() => goTo("booking")} />
            )}
          </div>
          <div className="state-note"><Icon name="check" /><span><strong>Showing verified availability</strong> for Alder House only. Rates include utilities and Wi-Fi.</span></div>
        </section>
      </main>
    </div>
  );
}

function BookingPage({ goTo }: { goTo: (page: Page) => void }) {
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  if (submitted) {
    return (
      <div className="booking-shell">
        <PublicHeader goTo={goTo} />
        <main className="confirmation">
          <span className="confirmation__icon"><Icon name="check" size={32} /></span>
          <p className="eyebrow">Request received</p>
          <h1>We’ll take it from here.</h1>
          <p>Your request for a Twin Residence has been sent to the Alder House team. This is a room-type request—not a specific bed assignment.</p>
          <div className="confirmation__ref"><span>Booking reference</span><strong>AH-2051</strong></div>
          <div className="confirmation__actions"><Button onClick={() => goTo("student")}>Open student portal</Button><Button variant="secondary" onClick={() => goTo("home")}>Return home</Button></div>
        </main>
      </div>
    );
  }
  return (
    <div className="booking-shell">
      <PublicHeader goTo={goTo} />
      <main className="booking-layout content-section">
        <section>
          <button className="back-link" onClick={() => goTo("rooms")}><Icon name="arrow" /> Back to rooms</button>
          <p className="eyebrow">Booking request · Step {step} of 2</p>
          <h1>{step === 1 ? "Tell us about yourself" : "Review your request"}</h1>
          <div className="step-line"><span className="active">1</span><i /><span className={step === 2 ? "active" : ""}>2</span></div>
          {step === 1 ? (
            <form className="booking-form" onSubmit={(e) => { e.preventDefault(); setStep(2); }}>
              <div className="form-grid">
                <label><span>First name</span><input required defaultValue="Sofia" /></label>
                <label><span>Last name</span><input required defaultValue="Chen" /></label>
                <label className="full"><span>Email address</span><input required type="email" defaultValue="sofia.chen@example.edu" /></label>
                <label><span>Phone number</span><input required defaultValue="+1 503 555 0188" /></label>
                <label><span>Student ID</span><input required defaultValue="PDX-492801" /></label>
                <label className="full"><span>University</span><select defaultValue="Portland State University"><option>Portland State University</option><option>University of Portland</option></select></label>
              </div>
              <label className="check-field"><input type="checkbox" required /><span>I confirm the information above is accurate and agree to the residence terms.</span></label>
              <Button>Continue to review <Icon name="arrow" /></Button>
            </form>
          ) : (
            <div className="review-card">
              <div><span>Applicant</span><strong>Sofia Chen</strong><small>sofia.chen@example.edu</small></div>
              <div><span>Requested room type</span><strong>Twin Residence</strong><small>Shared bath · Academic year</small></div>
              <div><span>Move-in</span><strong>24 August 2026</strong><small>Estimated 10-month term</small></div>
              <div><span>Monthly rate</span><strong>$590</strong><small>Utilities and Wi-Fi included</small></div>
              <div className="review-note"><Icon name="clock" /><p><strong>What happens next?</strong><br />Staff will review your request, then an authorized team member will assign a specific bed.</p></div>
              <div className="review-actions"><Button variant="secondary" onClick={() => setStep(1)}>Edit details</Button><Button onClick={() => setSubmitted(true)}>Submit request <Icon name="arrow" /></Button></div>
            </div>
          )}
        </section>
        <aside className="booking-summary">
          <img src={photos.shared} alt="Twin Residence" />
          <div><p className="eyebrow">Your selection</p><h2>Twin Residence</h2><p>Two students · Shared bath</p><dl><div><dt>Monthly</dt><dd>$590</dd></div><div><dt>Deposit</dt><dd>$590</dd></div></dl></div>
        </aside>
      </main>
    </div>
  );
}

function LookupPage({ goTo }: { goTo: (page: Page) => void }) {
  const [found, setFound] = useState(false);
  return (
    <div className="lookup-page">
      <PublicHeader goTo={goTo} />
      <main className="lookup-main">
        <p className="eyebrow">Booking lookup</p><h1>Find your booking</h1><p>Enter the reference from your confirmation email.</p>
        <form onSubmit={(e) => { e.preventDefault(); setFound(true); }}><label><span>Booking reference</span><input required placeholder="e.g. AH-2051" /></label><label><span>Email address</span><input required type="email" placeholder="you@example.edu" /></label><Button><Icon name="search" /> Look up booking</Button></form>
        {found && <article className="lookup-result"><div><span className="badge badge--approved">Approved</span><small>AH-2051</small></div><h2>Twin Residence</h2><p>Move-in: 24 August 2026 · Alder House, Portland</p><Button variant="secondary" onClick={() => goTo("student")}>View in student portal</Button></article>}
      </main>
    </div>
  );
}

const reservations = [
  { initials: "AM", name: "Aisha Malik", id: "AH-2048", room: "Courtyard Single", date: "Aug 24, 2026", amount: "$760", status: "Pending review" },
  { initials: "JL", name: "Jonah Lee", id: "AH-2047", room: "Garden Studio", date: "Aug 22, 2026", amount: "$1,120", status: "Approved" },
  { initials: "SC", name: "Sofia Chen", id: "AH-2046", room: "Twin Residence", date: "Aug 24, 2026", amount: "$590", status: "Bed assigned" },
  { initials: "EO", name: "Elias Ortiz", id: "AH-2045", room: "Courtyard Single", date: "Sep 01, 2026", amount: "$760", status: "Pending review" },
];

function SideNav({ view, setView }: { view: AdminView; setView: (view: AdminView) => void }) {
  const item = (key: AdminView, label: string, icon: IconName) => (
    <button className={view === key ? "active" : ""} onClick={() => setView(key)}><Icon name={icon} /> {label}</button>
  );
  return (
    <aside className="side-nav">
      <Logo inverse />
      <nav>
        <p>Workspace</p>
        {item("overview", "Overview", "home")}
        {item("reservations", "Reservations", "calendar")}
        {item("inventory", "Rooms & beds", "bed")}
        {item("residents", "Residents", "people")}
        <p>Operations</p>
        {item("checkin", "Check-in", "door")}
        {item("payments", "Payments", "wallet")}
        {item("reports", "Reports", "download")}
        {item("settings", "Settings", "menu")}
      </nav>
      <div className="side-nav__user"><span>MN</span><div><strong>Maya Nelson</strong><small>Residence manager</small></div></div>
    </aside>
  );
}

function Stat({ label, value, note, icon }: { label: string; value: string; note: string; icon: IconName }) {
  return <article className="stat"><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div><span className="stat__icon"><Icon name={icon} /></span></article>;
}

function AdminPage({ goTo }: { goTo: (page: Page) => void }) {
  const [view, setView] = useState<AdminView>("overview");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState(false);
  const visible = reservations.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()) || r.id.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="portal">
      <SideNav view={view} setView={setView} />
      <main className="portal-main">
        <header className="portal-top"><div><small>Alder House</small><span>Hostel administration</span></div><div className="portal-top__actions"><button onClick={() => goTo("platform")}>Platform admin</button><Button onClick={() => setNotice(true)}>+ New reservation</Button></div></header>
        <div className="portal-content">
          {notice && <div className="notice"><Icon name="check" /><span><strong>New reservation flow opened.</strong> This first-stage demo keeps tenant data in presentation only.</span><button onClick={() => setNotice(false)} aria-label="Dismiss"><Icon name="close" /></button></div>}
          {view === "overview" ? <>
            <div className="page-heading"><div><p className="eyebrow">Monday, 17 August</p><h1>Good morning, Maya</h1><p>Here’s what needs your attention today.</p></div><Button variant="secondary"><Icon name="download" /> Export report</Button></div>
            <section className="stats">
              <Stat label="Occupancy" value="87%" note="104 of 120 beds" icon="bed" />
              <Stat label="Pending requests" value="12" note="4 added today" icon="clock" />
              <Stat label="Arriving this week" value="18" note="Next arrival tomorrow" icon="door" />
              <Stat label="Outstanding" value="$8,420" note="Across 14 invoices" icon="wallet" />
            </section>
            <ReservationTable visible={visible} query={query} setQuery={setQuery} onAllocate={() => setView("reservations")} />
          </> : <AdminSection view={view} />}
        </div>
      </main>
    </div>
  );
}

function ReservationTable({ visible, query, setQuery, onAllocate }: { visible: typeof reservations; query: string; setQuery: (value: string) => void; onAllocate: () => void }) {
  return <section className="panel">
    <div className="panel__heading"><div><h2>Reservation requests</h2><p>Review room-type requests before assigning a specific bed.</p></div><button className="text-link" onClick={onAllocate}>View all <Icon name="arrow" /></button></div>
    <div className="table-tools"><label><Icon name="search" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search resident or ID" /></label><button>All statuses <Icon name="chevron" /></button></div>
    <div className="table-wrap"><table><thead><tr><th>Resident</th><th>Room requested</th><th>Move-in</th><th>Monthly</th><th>Status</th><th></th></tr></thead>
      <tbody>{visible.map((r) => <tr key={r.id}><td><div className="resident"><span>{r.initials}</span><div><strong>{r.name}</strong><small>{r.id}</small></div></div></td><td>{r.room}</td><td>{r.date}</td><td>{r.amount}</td><td><span className={`badge badge--${r.status.toLowerCase().replace(" ", "-")}`}>{r.status}</span></td><td><button className="row-action" onClick={onAllocate} aria-label={`Open ${r.name}'s reservation`}><Icon name="chevron" /></button></td></tr>)}</tbody>
    </table>{!visible.length && <div className="empty-state"><Icon name="search" size={28} /><h3>No reservations found</h3><p>Try a different name or reservation ID.</p></div>}</div>
  </section>;
}

const adminCopy: Record<Exclude<AdminView, "overview" | "reservations">, { eyebrow: string; title: string; description: string }> = {
  inventory: { eyebrow: "Inventory", title: "Rooms & beds", description: "A clear view of capacity, occupancy, and beds ready to assign." },
  residents: { eyebrow: "Directory", title: "Residents", description: "Current students, contact details, and residence status." },
  checkin: { eyebrow: "Arrivals", title: "Check-in & check-out", description: "Keep every arrival and departure organized." },
  payments: { eyebrow: "Finance", title: "Invoices & payments", description: "Track balances, receipts, and payment status." },
  reports: { eyebrow: "Insights", title: "Reports", description: "Useful operational reporting without decorative metrics." },
  settings: { eyebrow: "Configuration", title: "Branding & settings", description: "Manage tenant identity, staff access, and booking preferences." },
};

function AdminSection({ view }: { view: Exclude<AdminView, "overview"> }) {
  const [allocated, setAllocated] = useState(false);
  const [saved, setSaved] = useState(false);
  if (view === "reservations") return <section>
    <div className="page-heading"><div><p className="eyebrow">Booking operations</p><h1>Reservations</h1><p>Review requests and assign beds only after approval.</p></div><Button>+ Add reservation</Button></div>
    <div className="detail-layout">
      <div><ReservationTable visible={reservations} query="" setQuery={() => undefined} onAllocate={() => setAllocated(true)} /></div>
      <aside className="allocation-panel">
        <p className="eyebrow">Selected request</p><h2>Aisha Malik</h2><span className="badge badge--pending-review">Pending review</span>
        <dl><div><dt>Requested</dt><dd>Courtyard Single</dd></div><div><dt>Move-in</dt><dd>24 Aug 2026</dd></div><div><dt>Reference</dt><dd>AH-2048</dd></div></dl>
        <hr /><h3>Review & allocate</h3>
        <label><span>Decision</span><select defaultValue="Approve request"><option>Approve request</option><option>Decline request</option></select></label>
        <label><span>Assign available bed</span><select defaultValue="C-214 · Bed A"><option>C-214 · Bed A</option><option>C-216 · Bed B</option></select></label>
        <Button onClick={() => setAllocated(true)}>{allocated ? <><Icon name="check" /> Bed C-214A assigned</> : "Confirm assignment"}</Button>
      </aside>
    </div>
  </section>;
  const copy = adminCopy[view];
  return <section>
    <div className="page-heading"><div><p className="eyebrow">{copy.eyebrow}</p><h1>{copy.title}</h1><p>{copy.description}</p></div><Button variant="secondary"><Icon name="download" /> Export</Button></div>
    {view === "inventory" && <><section className="stats"><Stat label="Total beds" value="120" note="Across 42 rooms" icon="bed" /><Stat label="Occupied" value="104" note="87% occupancy" icon="people" /><Stat label="Available" value="12" note="Ready to assign" icon="check" /><Stat label="Maintenance" value="4" note="Temporarily blocked" icon="clock" /></section><div className="floor-grid">{["Courtyard · Floor 1", "Courtyard · Floor 2", "Garden Wing · Floor 1"].map((floor, i) => <article className="panel floor" key={floor}><div><h2>{floor}</h2><span>{i === 2 ? "8 of 10" : "12 of 14"} occupied</span></div><div className="bed-map">{Array.from({ length: 10 }).map((_, n) => <span className={n > 6 ? "available" : n === 5 ? "blocked" : ""} key={n}>{101 + n}</span>)}</div></article>)}</div></>}
    {view === "residents" && <SimpleDirectory />}
    {view === "checkin" && <div className="kanban">{["Ready today", "Arriving this week", "Checked in"].map((title, i) => <section key={title}><h3>{title}<span>{i + 2}</span></h3>{reservations.slice(0, i + 1).map((r) => <article><div className="resident"><span>{r.initials}</span><div><strong>{r.name}</strong><small>{r.room}</small></div></div><p>{r.date}</p><Button variant="secondary">{i === 0 ? "Start check-in" : "View details"}</Button></article>)}</section>)}</div>}
    {view === "payments" && <FinancePanel />}
    {view === "reports" && <ReportsPanel />}
    {view === "settings" && <SettingsPanel saved={saved} onSave={() => setSaved(true)} />}
  </section>;
}

function SimpleDirectory() {
  return <section className="panel"><div className="table-tools"><label><Icon name="search" /><input placeholder="Search residents" /></label><Button>+ Add resident</Button></div><div className="table-wrap"><table><thead><tr><th>Resident</th><th>Room & bed</th><th>Contact</th><th>Term</th><th>Status</th></tr></thead><tbody>{reservations.map((r, i) => <tr key={r.id}><td><div className="resident"><span>{r.initials}</span><div><strong>{r.name}</strong><small>{r.id}</small></div></div></td><td>{i % 2 ? `G-${201 + i}B` : `C-${112 + i}A`}</td><td>{r.name.split(" ")[0].toLowerCase()}@example.edu</td><td>2026–27</td><td><span className="badge badge--approved">Active</span></td></tr>)}</tbody></table></div></section>;
}

function FinancePanel() {
  return <><section className="stats"><Stat label="Collected" value="$74.8k" note="This month" icon="wallet" /><Stat label="Outstanding" value="$8,420" note="14 open invoices" icon="clock" /><Stat label="Overdue" value="$1,180" note="3 invoices" icon="calendar" /><Stat label="Refunds" value="$590" note="1 pending" icon="download" /></section><section className="panel"><div className="panel__heading"><div><h2>Recent invoices</h2><p>Development sample data · not connected to live payments.</p></div></div><div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Resident</th><th>Issued</th><th>Amount</th><th>Status</th></tr></thead><tbody>{reservations.map((r, i) => <tr key={r.id}><td>INV-10{42 + i}</td><td>{r.name}</td><td>01 Aug 2026</td><td>{r.amount}</td><td><span className={`badge ${i < 2 ? "badge--approved" : "badge--pending-review"}`}>{i < 2 ? "Paid" : "Due"}</span></td></tr>)}</tbody></table></div></section></>;
}

function ReportsPanel() {
  return <div className="report-grid"><article className="panel report-card"><p className="eyebrow">Occupancy trend</p><h2>Stable demand into autumn</h2><div className="bar-chart">{[62, 68, 73, 78, 82, 87].map((v, i) => <div key={v}><span style={{ height: `${v}%` }} /><small>{["Mar", "Apr", "May", "Jun", "Jul", "Aug"][i]}</small></div>)}</div></article><article className="panel report-list"><p className="eyebrow">Room type performance</p>{rooms.map((r, i) => <div key={r.name}><span>{r.name}</span><strong>{[94, 81, 88][i]}%</strong><i><b style={{ width: `${[94, 81, 88][i]}%` }} /></i></div>)}</article></div>;
}

function SettingsPanel({ saved, onSave }: { saved: boolean; onSave: () => void }) {
  return <div className="settings-grid"><nav className="settings-tabs"><button className="active">Residence profile</button><button>Booking rules</button><button>Staff & permissions</button><button>Notifications</button></nav><form className="panel settings-form" onSubmit={(e) => { e.preventDefault(); onSave(); }}><h2>Residence profile</h2><p>Shown on the public website and student communications.</p><div className="form-grid"><label className="full"><span>Residence name</span><input defaultValue="Alder House" /></label><label className="full"><span>Public email</span><input type="email" defaultValue="hello@alderhouse.example" /></label><label><span>Primary color</span><input defaultValue="#234536" /></label><label><span>Timezone</span><select><option>America/Los_Angeles</option></select></label><label className="full"><span>Address</span><input defaultValue="218 Alder Street, Portland, OR" /></label></div><Button>{saved ? <><Icon name="check" /> Changes saved</> : "Save changes"}</Button></form></div>;
}

function StudentPage({ goTo }: { goTo: (page: Page) => void }) {
  const [view, setView] = useState<StudentView>("overview");
  return (
    <div className="student-page">
      <header className="student-header"><Logo /><nav>{(["overview", "booking", "payments", "support"] as StudentView[]).map((item) => <button className={view === item ? "active" : ""} onClick={() => setView(item)} key={item}>{item === "booking" ? "My booking" : item[0].toUpperCase() + item.slice(1)}</button>)}</nav><button className="avatar" onClick={() => setView("profile")}>SC</button></header>
      <main className="student-content">
        <button className="back-link" onClick={() => goTo("home")}><Icon name="arrow" /> Public website</button>
        {view === "overview" ? <><div className="page-heading"><div><p className="eyebrow">Student portal</p><h1>Welcome back, Sofia</h1><p>Everything about your stay, all in one place.</p></div></div><section className="student-grid">
          <article className="booking-status">
            <div><p className="eyebrow eyebrow--light">Your booking</p><span className="badge badge--approved"><Icon name="check" size={14} /> Approved</span></div>
            <h2>Your place at Alder House is confirmed.</h2>
            <p>Your requested room type has been approved. Our team will assign your specific room and bed before arrival.</p>
            <div className="progress">
              <span className="done">Request sent</span><span className="done">Approved</span><span>Bed assigned</span><span>Check in</span>
            </div>
          </article>
          <article className="next-step panel">
            <span className="stat__icon"><Icon name="wallet" /></span><p className="eyebrow">Next step</p><h2>Pay your deposit</h2><p>Secure your booking by 21 August.</p><strong>$590.00</strong><Button onClick={() => setView("payments")}>Make payment <Icon name="arrow" /></Button>
          </article>
          <article className="panel room-summary">
            <div className="panel__heading"><div><p className="eyebrow">Your room</p><h2>Twin Residence</h2></div><span className="badge">Awaiting allocation</span></div>
            <div><img src={photos.shared} alt="Twin Residence room" /><dl><div><dt>Move in</dt><dd>24 August 2026</dd></div><div><dt>Term</dt><dd>Academic year</dd></div><div><dt>Room & bed</dt><dd>Assigned before arrival</dd></div></dl></div>
          </article>
          <article className="panel tasks">
            <div className="panel__heading"><div><p className="eyebrow">Before you arrive</p><h2>2 tasks remaining</h2></div></div>
            <label><input type="checkbox" defaultChecked /><span><strong>Booking details reviewed</strong><small>Completed 16 August</small></span></label>
            <label><input type="checkbox" /><span><strong>Pay your booking deposit</strong><small>Due 21 August</small></span></label>
            <label><input type="checkbox" /><span><strong>Complete check-in profile</strong><small>Takes about 4 minutes</small></span></label>
          </article>
        </section></> : <StudentSection view={view} />}
      </main>
    </div>
  );
}

function StudentSection({ view }: { view: Exclude<StudentView, "overview"> }) {
  const [sent, setSent] = useState(false);
  const titles = { booking: ["My booking", "Your request, allocation, and arrival details."], payments: ["Payments & receipts", "See what’s due and keep a clear payment history."], support: ["Maintenance & support", "Tell the residence team when something needs attention."], profile: ["Profile & account", "Keep your contact and emergency information current."] };
  const [title, description] = titles[view];
  return <section><div className="page-heading"><div><p className="eyebrow">Student portal</p><h1>{title}</h1><p>{description}</p></div></div>
    {view === "booking" && <div className="student-detail-grid"><article className="panel detail-card"><p className="eyebrow">Booking AH-2051</p><h2>Twin Residence</h2><span className="badge badge--approved">Approved · Awaiting bed</span><dl><div><dt>Move in</dt><dd>24 Aug 2026</dd></div><div><dt>Term</dt><dd>Academic year</dd></div><div><dt>Monthly</dt><dd>$590</dd></div><div><dt>Specific bed</dt><dd>Not yet assigned</dd></div></dl></article><article className="panel detail-card"><p className="eyebrow">Check-in information</p><h2>Arrival window</h2><p>Choose an arrival time once your bed is assigned. Bring a photo ID and enrollment confirmation.</p><ul><li><Icon name="check" /> Photo identification</li><li><Icon name="check" /> University enrollment record</li><li><Icon name="check" /> Deposit receipt</li></ul></article></div>}
    {view === "payments" && <div className="student-detail-grid"><article className="panel pay-card"><p className="eyebrow">Amount due</p><h2>$590.00</h2><p>Booking deposit · Due 21 August 2026</p><label><span>Payment method</span><select><option>Visa ending in 4421</option><option>Add another card</option></select></label><Button onClick={() => setSent(true)}>{sent ? <><Icon name="check" /> Payment complete</> : "Pay securely"}</Button></article><article className="panel detail-card"><p className="eyebrow">Payment history</p><div className="receipt"><span><Icon name="download" /></span><div><strong>Application fee</strong><small>16 Aug 2026 · Receipt RC-1048</small></div><b>$45.00</b></div></article></div>}
    {view === "support" && <form className="panel support-form" onSubmit={(e) => { e.preventDefault(); setSent(true); }}><div><p className="eyebrow">New request</p><h2>{sent ? "Request sent successfully" : "What can we help with?"}</h2><p>{sent ? "The residence team will update you in the portal." : "For emergencies, contact the 24-hour residence desk directly."}</p></div>{!sent && <div className="form-grid"><label><span>Category</span><select><option>Room maintenance</option><option>Shared facilities</option><option>Account support</option></select></label><label><span>Urgency</span><select><option>Standard</option><option>Urgent</option></select></label><label className="full"><span>Describe the issue</span><textarea required placeholder="Include the location and what you’ve noticed." /></label><Button>Submit request</Button></div>}</form>}
    {view === "profile" && <form className="panel support-form" onSubmit={(e) => { e.preventDefault(); setSent(true); }}><div><p className="eyebrow">Personal details</p><h2>Profile information</h2><p>Used for your stay and emergency contact records.</p></div><div className="form-grid"><label><span>First name</span><input defaultValue="Sofia" /></label><label><span>Last name</span><input defaultValue="Chen" /></label><label className="full"><span>Email</span><input defaultValue="sofia.chen@example.edu" /></label><label className="full"><span>Emergency contact</span><input defaultValue="Mei Chen · +1 503 555 0102" /></label><Button>{sent ? "Profile saved" : "Save profile"}</Button></div></form>}
  </section>;
}

function PlatformPage({ goTo }: { goTo: (page: Page) => void }) {
  const [created, setCreated] = useState(false);
  const tenants = [{ name: "Alder House", domain: "stay.alderhouse.co", beds: 120, status: "Active" }, { name: "Morrow Hall", domain: "live.morrowhall.edu", beds: 286, status: "Active" }, { name: "Cedar & Stone", domain: "cedar-stone.example", beds: 84, status: "Verifying" }, { name: "Northbank Living", domain: "northbank.example", beds: 192, status: "Suspended" }];
  return <div className="platform">
    <aside><div className="platform-logo"><span>R</span><strong>ResidenceOS</strong></div><nav><button className="active"><Icon name="home" /> Platform overview</button><button><Icon name="people" /> Tenants</button><button><Icon name="check" /> Domain status</button></nav><button className="back-admin" onClick={() => goTo("admin")}><Icon name="arrow" /> Hostel admin</button></aside>
    <main><header><div><small>Platform administration</small><strong>All tenants</strong></div><Button onClick={() => setCreated(true)}>+ Create tenant</Button></header><div className="platform-content">
      {created && <div className="notice"><Icon name="check" /><span><strong>Tenant setup started.</strong> Configuration remains isolated until domain verification is complete.</span><button onClick={() => setCreated(false)}><Icon name="close" /></button></div>}
      <div className="page-heading"><div><p className="eyebrow">Operations</p><h1>Platform overview</h1><p>Tenant health and configuration across ResidenceOS.</p></div></div>
      <section className="platform-stats"><Stat label="Active tenants" value="24" note="2 onboarding" icon="home" /><Stat label="Managed beds" value="3,842" note="Across 31 properties" icon="bed" /><Stat label="Domain issues" value="2" note="Require attention" icon="clock" /></section>
      <section className="panel"><div className="panel__heading"><div><h2>Tenant directory</h2><p>Operational status and domain verification.</p></div><label className="compact-search"><Icon name="search" /><input placeholder="Search tenants" /></label></div><div className="table-wrap"><table><thead><tr><th>Tenant</th><th>Primary domain</th><th>Managed beds</th><th>Status</th><th></th></tr></thead><tbody>{tenants.map((t) => <tr key={t.name}><td><strong>{t.name}</strong></td><td>{t.domain}</td><td>{t.beds}</td><td><span className={`badge ${t.status === "Active" ? "badge--approved" : t.status === "Verifying" ? "badge--pending-review" : ""}`}>{t.status}</span></td><td><button className="row-action"><Icon name="chevron" /></button></td></tr>)}</tbody></table></div></section>
    </div></main>
  </div>;
}

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const goTo = (next: Page) => {
    setPage(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  if (page === "rooms") return <RoomsPage goTo={goTo} />;
  if (page === "booking") return <BookingPage goTo={goTo} />;
  if (page === "lookup") return <LookupPage goTo={goTo} />;
  if (page === "admin") return <AdminPage goTo={goTo} />;
  if (page === "student") return <StudentPage goTo={goTo} />;
  if (page === "platform") return <PlatformPage goTo={goTo} />;
  return <HomePage goTo={goTo} />;
}
