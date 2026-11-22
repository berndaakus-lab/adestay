// Phase 3, task 8. Booking races on real PostgreSQL with one connection per caller
// (acceptance criteria 2 and 3; docs/adr/0003-booking-concurrency.md). PGlite has one connection,
// so these cannot run in the pgTAP suite. Uses throwaway data in a temporary database.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type Client = ReturnType<EmbeddedPostgres["getPgClient"]>;
type Who = { user: string; aal?: string } | "service";
type Outcome = { ok: boolean; code?: string; rows: Record<string, unknown>[] };

const root = path.resolve(__dirname, "../..");
const dataDir = mkdtempSync(path.join(tmpdir(), "adestay-races-"));
let pg: EmbeddedPostgres;
let admin: Client;
let port = 0;

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port: p } = server.address() as { port: number };
      server.close(() => resolve(p));
    });
  });

const databaseDir = path.join(dataDir, "data");
const serverOptions = () => `-p ${port} -c listen_addresses=127.0.0.1 -c max_connections=120 -c timezone=UTC`;

// On Windows, postgres.exe refuses to run from an administrator account. pg_ctl is PostgreSQL's
// supported launcher there: it starts the server with a restricted token.
const windowsPgCtl = path.join(root, "node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe");
const pgCtl = (args: string[]) => execFileSync(windowsPgCtl, ["-D", databaseDir, "-w", "-t", "60", ...args], { stdio: "ignore" });

beforeAll(async () => {
  port = await freePort();
  pg = new EmbeddedPostgres({
    databaseDir,
    user: "postgres",
    password: "local-test-only",
    port,
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    postgresFlags: serverOptions().split(" "),
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  if (process.platform === "win32") pgCtl(["-o", serverOptions(), "start"]);
  else await pg.start();
  const bootstrap = pg.getPgClient("postgres", "127.0.0.1");
  await bootstrap.connect();
  await bootstrap.query("create database adestay");
  await bootstrap.end();
  admin = pg.getPgClient("adestay", "127.0.0.1");
  await admin.connect();
  await admin.query(readFileSync(path.join(root, "supabase/tests/support/supabase_shim.sql"), "utf8"));
  await admin.query("set search_path to public, extensions");
  const dir = path.join(root, "supabase/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await admin.query(readFileSync(path.join(dir, file), "utf8"));
  }
});

afterAll(async () => {
  await admin?.end().catch(() => {});
  if (process.platform === "win32") {
    try {
      pgCtl(["-m", "fast", "stop"]);
    } catch {
      // Already stopped, or never started.
    }
  } else {
    await pg?.stop().catch(() => {});
  }
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

/** Opens a connection with an open transaction, acting exactly as PostgREST would for this caller. */
async function open(who: Who): Promise<Client> {
  const client = pg.getPgClient("adestay", "127.0.0.1");
  await client.connect();
  await client.query("begin");
  if (who === "service") {
    await client.query("set local role service_role");
  } else {
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: who.user, role: "authenticated", aal: who.aal ?? "aal1" }),
    ]);
    await client.query("set local role authenticated");
  }
  return client;
}

async function fire(client: Client, sql: string, params: unknown[]): Promise<Outcome> {
  try {
    const { rows } = await client.query(sql, params);
    await client.query("commit");
    return { ok: true, rows };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    return { ok: false, code: (error as { code?: string }).code, rows: [] };
  } finally {
    await client.end().catch(() => {});
  }
}

/** Connects every caller first, then sends all the calls at the same moment. */
async function race(calls: { who: Who; sql: string; params: unknown[] }[]): Promise<Outcome[]> {
  const clients = await Promise.all(calls.map((c) => open(c.who)));
  return Promise.all(calls.map((c, i) => fire(clients[i], c.sql, c.params)));
}

const count = async (sql: string, params: unknown[]) => Number((await admin.query(sql, params)).rows[0].n);
const codes = (results: Outcome[]) => results.filter((r) => !r.ok).map((r) => r.code);

interface Hostel {
  tenant: string;
  prefix: string;
  manager: string;
  year: string;
  semester: string;
  roomType: string;
}

async function hostel(beds: number): Promise<Hostel> {
  const tenant = randomUUID();
  const manager = randomUUID();
  const year = randomUUID();
  const semester = randomUUID();
  const roomType = randomUUID();
  const prefix = Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
  await admin.query("insert into public.tenants (id, slug, name, reference_prefix, status) values ($1, $2, 'Race hostel', $3, 'active')",
    [tenant, `race-${tenant.slice(0, 8)}`, prefix]);
  await admin.query("insert into public.tenant_profiles (tenant_id, display_name, is_published) values ($1, 'Race hostel', true)", [tenant]);
  await admin.query("insert into public.tenant_settings (tenant_id, hold_duration_hours, hold_extension_max) values ($1, 120, 1)", [tenant]);
  await admin.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [manager, `${manager}@example.com`]);
  await admin.query(
    `insert into public.tenant_memberships (tenant_id, user_id, role, permission_set_id, status)
     values ($1, $2, 'staff', (select id from public.permission_sets where key = 'manager' and is_system), 'active')`, [tenant, manager]);
  await admin.query(
    `insert into public.booking_periods (id, tenant_id, name, kind, starts_on, ends_on, status) values
     ($1, $3, 'Year', 'academic_year', '2040-09-01', '2041-07-31', 'open'),
     ($2, $3, 'Semester', 'semester', '2040-09-01', '2040-12-20', 'open')`, [year, semester, tenant]);
  await admin.query("insert into public.room_types (id, tenant_id, name, slug, occupancy, is_published) values ($1, $2, 'Room', 'room', 12, true)", [roomType, tenant]);
  await admin.query(
    `insert into public.room_type_prices (tenant_id, room_type_id, booking_period_id, amount_minor)
     values ($1, $2, $3, 100000), ($1, $2, $4, 50000)`, [tenant, roomType, year, semester]);
  for (let r = 0; r * 12 < beds; r++) {
    const room = randomUUID();
    await admin.query("insert into public.rooms (id, tenant_id, room_type_id, label) values ($1, $2, $3, $4)", [room, tenant, roomType, `R-${r}`]);
    await admin.query(
      "insert into public.beds (tenant_id, room_id, label) select $1, $2, 'B' || n from generate_series(1, $3::int) n",
      [tenant, room, Math.min(12, beds - r * 12)]);
  }
  return { tenant, prefix, manager, year, semester, roomType };
}

async function request(h: Hostel, period = h.year, status = "submitted"): Promise<string> {
  const resident = randomUUID();
  const id = randomUUID();
  await admin.query("insert into public.residents (id, tenant_id, full_name, email) values ($1, $2, 'Race Student', $3)",
    [resident, h.tenant, `${resident}@example.com`]);
  await admin.query(
    `insert into public.booking_requests (id, tenant_id, reference, resident_id, booking_period_id, room_type_id, status,
       quoted_amount_minor, decided_at, idempotency_key)
     values ($1, $2, app.generate_booking_reference($3), $4, $5, $6, $7::text, 1000,
       case when $7::text = 'approved' then now() end, gen_random_uuid())`,
    [id, h.tenant, h.prefix, resident, period, h.roomType, status]);
  return id;
}

async function hold(h: Hostel, expires: string): Promise<{ request: string; reservation: string }> {
  const req = await request(h, h.year, "approved");
  const reservation = randomUUID();
  await admin.query(
    `insert into public.reservations (id, tenant_id, booking_request_id, room_type_id, booking_period_id, status, hold_expires_at)
     values ($1, $2, $3, $4, $5, 'held', now() + $6::interval)`, [reservation, h.tenant, req, h.roomType, h.year, expires]);
  return { request: req, reservation };
}

const approve = (h: Hostel, id: string) => ({
  who: { user: h.manager } as Who,
  sql: "select * from public.approve_booking_request($1)",
  params: [id] as unknown[],
});
const liveCount = (h: Hostel) =>
  count("select count(*) as n from public.reservations where tenant_id = $1 and status in ('held', 'confirmed', 'fulfilled')", [h.tenant]);

describe("approvals", () => {
  it("criterion 2: 20 parallel approvals for 1 remaining bed create exactly 1 reservation (10 rounds)", async () => {
    for (let round = 0; round < 10; round++) {
      const h = await hostel(3);
      await hold(h, "5 days");
      await hold(h, "5 days");
      const ids = await Promise.all(Array.from({ length: 20 }, () => request(h)));
      const results = await race(ids.map((id) => approve(h, id)));
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(codes(results)).toEqual(Array(19).fill("AS409"));
      expect(await liveCount(h)).toBe(3);
    }
  });

  it("overlapping periods cannot both take the last bed", async () => {
    for (let round = 0; round < 5; round++) {
      const h = await hostel(1);
      const years = await Promise.all(Array.from({ length: 10 }, () => request(h, h.year)));
      const semesters = await Promise.all(Array.from({ length: 10 }, () => request(h, h.semester)));
      const results = await race([...years, ...semesters].map((id) => approve(h, id)));
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(codes(results)).toEqual(Array(19).fill("AS409"));
    }
  });

  it("the same request approved 20 times at once is approved once", async () => {
    const h = await hostel(5);
    const id = await request(h);
    const results = await race(Array.from({ length: 20 }, () => approve(h, id)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(codes(results)).toEqual(Array(19).fill("55000"));
    expect(await count("select count(*) as n from public.reservations where booking_request_id = $1", [id])).toBe(1);
    expect(await count("select count(*) as n from public.audit_logs where action = 'booking.approved' and entity_id = $1", [id])).toBe(1);
  });
});

describe("submission", () => {
  it("criterion 3: 20 parallel submits with one key return one reference", async () => {
    const h = await hostel(5);
    const student = randomUUID();
    await admin.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [student, `${student}@example.com`]);
    const key = randomUUID();
    const results = await race(Array.from({ length: 20 }, () => ({
      who: { user: student } as Who,
      sql: "select * from public.submit_booking_request($1, $2, $3, $4, 'Race Student', '+233241234567')",
      params: [h.tenant, h.year, h.roomType, key] as unknown[],
    })));
    expect(codes(results)).toEqual([]);
    expect(new Set(results.map((r) => r.rows[0].booking_reference)).size).toBe(1);
    expect(results.filter((r) => r.rows[0].created === true)).toHaveLength(1);
    expect(await count("select count(*) as n from public.booking_requests where tenant_id = $1", [h.tenant])).toBe(1);
    expect(await count("select count(*) as n from public.residents where tenant_id = $1", [h.tenant])).toBe(1);
  });
});

describe("hold expiry", () => {
  const expireCall = { who: "service" as Who, sql: "select * from public.expire_reservations(200)", params: [] as unknown[] };

  it("parallel runs expire each overdue hold exactly once", async () => {
    const h = await hostel(40);
    const holds = await Promise.all(Array.from({ length: 30 }, () => hold(h, "-1 hour")));
    const results = await race(Array.from({ length: 6 }, () => expireCall));
    expect(codes(results)).toEqual([]);
    const lapsed = results.flatMap((r) => r.rows[0].lapsed_request_ids as string[]).filter((id) => holds.some((x) => x.request === id));
    expect(lapsed).toHaveLength(new Set(lapsed).size);
    await fire(await open("service"), expireCall.sql, []);
    expect(await count("select count(*) as n from public.reservations where tenant_id = $1 and status = 'expired'", [h.tenant])).toBe(30);
    expect(await count("select count(*) as n from public.audit_logs where tenant_id = $1 and action = 'reservation.expired'", [h.tenant])).toBe(30);
  });

  it("skips a row a staff action has locked, without waiting, and takes it next run", async () => {
    const h = await hostel(5);
    const busy = await hold(h, "-1 hour");
    const free = await hold(h, "-1 hour");
    const locker = pg.getPgClient("adestay", "127.0.0.1");
    await locker.connect();
    await locker.query("begin");
    await locker.query("select 1 from public.booking_requests where id = $1 for update", [busy.request]);
    const job = await open("service");
    await job.query("set local lock_timeout = '3s'");
    const first = await fire(job, expireCall.sql, []);
    expect(first.ok).toBe(true);
    expect(first.rows[0].lapsed_request_ids).toContain(free.request);
    expect(first.rows[0].lapsed_request_ids).not.toContain(busy.request);
    await locker.query("commit");
    await locker.end();
    const second = await fire(await open("service"), expireCall.sql, []);
    expect(second.rows[0].lapsed_request_ids).toContain(busy.request);
  });

  it("confirming and expiring an overdue hold at once leaves a consistent booking (20 rounds)", async () => {
    for (let round = 0; round < 20; round++) {
      const h = await hostel(1);
      const b = await hold(h, "-1 minute");
      const results = await race([
        { who: { user: h.manager }, sql: "select public.confirm_reservation($1, 'Paid in cash')", params: [b.reservation] },
        expireCall,
      ]);
      expect(results[1].ok).toBe(true);
      const { rows } = await admin.query(
        `select r.status as reservation, br.status as request from public.reservations r
         join public.booking_requests br on br.id = r.booking_request_id where r.id = $1`, [b.reservation]);
      if (results[0].ok) expect(rows[0]).toEqual({ reservation: "confirmed", request: "approved" });
      else {
        expect(results[0].code).toBe("55000");
        expect(rows[0]).toEqual({ reservation: "expired", request: "lapsed" });
      }
    }
  });
});

describe("mixed staff work", () => {
  it("never deadlocks or over-allocates (10 rounds)", async () => {
    for (let round = 0; round < 10; round++) {
      const h = await hostel(8);
      const holds = await Promise.all(Array.from({ length: 6 }, () => hold(h, "5 days")));
      const overdue = await Promise.all(Array.from({ length: 2 }, () => hold(h, "-1 minute")));
      const waiting = await Promise.all(Array.from({ length: 8 }, () => request(h)));
      const who: Who = { user: h.manager };
      const results = await race([
        { who, sql: "select public.extend_hold($1, 24, 'More time')", params: [holds[0].reservation] },
        { who, sql: "select public.extend_hold($1, 24, 'More time')", params: [overdue[0].reservation] },
        { who, sql: "select public.confirm_reservation($1, 'Paid')", params: [holds[1].reservation] },
        { who, sql: "select public.confirm_reservation($1, 'Paid')", params: [overdue[1].reservation] },
        { who, sql: "select public.cancel_booking_request($1, 'Left')", params: [holds[2].request] },
        { who, sql: "select public.cancel_booking_request($1, 'Left')", params: [holds[3].request] },
        ...waiting.map((id) => approve(h, id)),
        { who: "service", sql: "select * from public.expire_reservations(200)", params: [] },
        { who: "service", sql: "select * from public.expire_reservations(200)", params: [] },
      ]);
      // AS409 no capacity and 55000 lost-to-expiry are correct answers; a deadlock (40P01) is not.
      expect(codes(results).filter((c) => c !== "AS409" && c !== "55000")).toEqual([]);
      const live = await count(
        `select count(*) as n from public.reservations where tenant_id = $1
         and (status in ('confirmed', 'fulfilled') or (status = 'held' and hold_expires_at > now()))`, [h.tenant]);
      expect(live).toBeLessThanOrEqual(8);
    }
  });
});
