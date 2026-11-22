// TEST ONLY. A small in-memory stand-in for the Supabase HTTP API, so the real staff and platform
// screens and server actions can run in a browser without keys or Docker. It holds made-up data.
// It does NOT prove row level security: that is covered by the pgTAP suite on the real schema.
import http from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.FAKE_SUPABASE_PORT ?? 54399);
const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const S = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const id = (suffix) => `00000000-0000-4000-8000-0000000000${suffix}`;
const USERS = { platform: id("e1"), admin: id("a1"), manager: id("a2"), desk: id("a3"), pricer: id("a4"), accounts: id("a5"), suspended: id("c1") };
const SET = { desk: "90000000-0000-4000-8000-000000000001", manager: "90000000-0000-4000-8000-000000000002", pricer: "90000000-0000-4000-8000-000000000003", accounts: "90000000-0000-4000-8000-000000000004" };
const CATALOG = ["inventory.read", "inventory.manage", "pricing.manage", "settings.read", "settings.manage", "staff.manage", "audit.read"];

let db;
const objects = new Map();

function seed() {
  objects.clear();
  const member = (key, role, set, tenant = T) => ({
    id: randomUUID(), tenant_id: tenant, user_id: USERS[key], role, status: "active", permission_set_id: set, invited_email: `${key}@alder.test`, accepted_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z",
  });
  const profile = (tenant, name, published) => ({
    tenant_id: tenant, display_name: name, tagline: "A place to live.", about: null, logo_path: null, hero_image_path: null, primary_color: "#234536", accent_color: null,
    contact_phone: null, whatsapp_phone: null, contact_email: null, address: null, digital_address: null, landmark_directions: null, map_url: null, policies_md: null, terms_md: null, is_published: published,
  });
  db = {
    tenants: [
      { id: T, name: "Alder House", legal_name: null, slug: "alder-house", reference_prefix: "ALD", status: "active", suspended_at: null, suspension_reason: null, created_at: "2026-10-26T10:00:00Z" },
      { id: S, name: "Closed Hostel", legal_name: null, slug: "closed-hostel", reference_prefix: "CLO", status: "suspended", suspended_at: "2026-11-01T10:00:00Z", suspension_reason: "Unpaid", created_at: "2026-10-26T10:00:00Z" },
    ],
    tenant_domains: [],
    platform_admins: [{ user_id: USERS.platform }],
    tenant_profiles: [profile(T, "Alder House", true), profile(S, "Closed Hostel", true)],
    tenant_settings: [{ tenant_id: T, hold_duration_hours: 120, hold_extension_max: 1, deposit_policy: "fixed", deposit_value: 0, min_paid_percent_for_checkin: 100, require_payment_before_allocation: false, student_id_required: false, gender_policy_enforced: false }],
    permission_sets: [
      { id: SET.desk, tenant_id: null, key: "front_desk", name: "Front Desk", description: "Arrivals and check-in.", permissions: ["inventory.read"], is_system: true },
      { id: SET.manager, tenant_id: null, key: "manager", name: "Manager", description: "Day-to-day running.", permissions: ["inventory.read", "inventory.manage", "settings.read", "audit.read"], is_system: true },
      { id: SET.pricer, tenant_id: T, key: "pricing", name: "Pricing", description: null, permissions: ["pricing.manage"], is_system: false },
      { id: SET.accounts, tenant_id: null, key: "accounts", name: "Accounts", description: null, permissions: ["finance.read"], is_system: true },
    ],
    user_profiles: [{ id: USERS.admin, display_name: "Abena Owusu" }, { id: USERS.manager, display_name: "Kojo Manager" }],
    tenant_memberships: [
      member("admin", "hostel_admin", null),
      member("manager", "staff", SET.manager),
      member("desk", "staff", SET.desk),
      member("pricer", "staff", SET.pricer),
      member("accounts", "staff", SET.accounts),
      member("suspended", "hostel_admin", null, S),
    ],
    booking_periods: [],
    room_types: [],
    room_type_photos: [],
    rooms: [],
    beds: [],
    bed_blocks: [],
    room_type_prices: [],
  };
}
seed();

const subject = (req) => {
  try {
    return JSON.parse(Buffer.from((req.headers.authorization ?? "").split(" ")[1].split(".")[1], "base64url").toString()).sub ?? null;
  } catch {
    return null;
  }
};
const send = (res, value, status = 200, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(value));
};
const fail = (res, status, code) => send(res, { code, message: code, details: null, hint: null }, status);
const refuse = (code) => {
  throw code;
};

const activeMembership = (uid) => db.tenant_memberships.find((m) => m.user_id === uid && m.status === "active" && db.tenants.find((t) => t.id === m.tenant_id)?.status === "active");
const permissionsOf = (m) => (m.role === "hostel_admin" ? CATALOG : (db.permission_sets.find((s) => s.id === m.permission_set_id)?.permissions ?? []));
const has = (uid, permission) => {
  const m = activeMembership(uid);
  return Boolean(m) && permissionsOf(m).includes(permission);
};
const isPlatform = (uid) => uid === USERS.platform;
const canSeeRooms = (uid) => has(uid, "inventory.read") || has(uid, "inventory.manage");
const nextDay = (day) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

function capacity(uid) {
  if (!canSeeRooms(uid)) return [];
  return db.booking_periods.filter((p) => p.status !== "archived").flatMap((p) =>
    db.room_types.map((t) => {
      const rooms = db.rooms.filter((r) => r.room_type_id === t.id && r.status !== "retired");
      const beds = rooms.flatMap((r) => db.beds.filter((b) => b.room_id === r.id && b.status !== "retired").map((b) => ({ ...b, ok: b.status === "active" && r.status === "active" })));
      const blocked = (b) => db.bed_blocks.some((x) => x.bed_id === b.id && !x.released_at && x.start <= p.ends_on && x.end >= p.starts_on);
      return {
        room_type_id: t.id,
        booking_period_id: p.id,
        total_beds: beds.length,
        out_of_service_beds: beds.filter((b) => !b.ok).length,
        blocked_beds: beds.filter((b) => b.ok && blocked(b)).length,
        sellable_beds: beds.filter((b) => b.ok && !blocked(b)).length,
      };
    }),
  );
}

function importInventory(a, uid) {
  if (!has(uid, "inventory.manage")) refuse("42501");
  const errors = [];
  const plan = [];
  for (const row of a.p_rows) {
    const type = db.room_types.find((t) => t.slug === row.room_type.toLowerCase() || t.name.toLowerCase() === row.room_type.toLowerCase());
    if (!type) errors.push({ line: row.line, field: "room_type", message: "No room type with this name. Add it first." });
    if (db.rooms.some((r) => r.label.toLowerCase() === row.room.toLowerCase())) errors.push({ line: row.line, field: "room", message: "This room already exists." });
    if (type && row.beds.length > type.occupancy) errors.push({ line: row.line, field: "beds", message: `This room type allows ${type.occupancy} bed(s) per room.` });
    if (type) plan.push({ type, row });
  }
  if (errors.length) return { ok: false, dry_run: a.p_dry_run, rooms: 0, beds: 0, by_type: [], error_count: errors.length, errors };
  const by = new Map();
  for (const { type, row } of plan) {
    const entry = by.get(type.name) ?? { room_type: type.name, rooms: 0, beds: 0 };
    entry.rooms += 1;
    entry.beds += row.beds.length;
    by.set(type.name, entry);
    if (!a.p_dry_run) {
      const roomId = randomUUID();
      db.rooms.push({ id: roomId, tenant_id: T, room_type_id: type.id, label: row.room, block: row.block || null, floor: row.floor || null, gender_policy_override: null, status: "active", notes: null });
      for (const label of row.beds) db.beds.push({ id: randomUUID(), tenant_id: T, room_id: roomId, label, status: "active" });
    }
  }
  const list = [...by.values()];
  return { ok: true, dry_run: a.p_dry_run, rooms: plan.length, beds: list.reduce((n, x) => n + x.beds, 0), by_type: list, error_count: 0, errors: [] };
}

const requirePlatform = (uid) => {
  if (!isPlatform(uid)) refuse("42501");
};
const domain = (domainId) => db.tenant_domains.find((d) => d.id === domainId) ?? refuse("22023");
const invite = (tenant, email, role, set) => {
  if (db.tenant_memberships.some((m) => m.tenant_id === tenant && m.invited_email === email && m.status !== "revoked")) refuse("23505");
  const membershipId = randomUUID();
  db.tenant_memberships.push({ id: membershipId, tenant_id: tenant, user_id: null, role, status: "invited", permission_set_id: set, invited_email: email, accepted_at: null, created_at: new Date().toISOString() });
  return membershipId;
};
const resolved = (t) => (t && t.status !== "archived" ? [{ tenant_id: t.id, slug: t.slug, status: t.status }] : []);

const RPC = {
  my_memberships: (_a, uid) =>
    db.tenant_memberships
      .filter((m) => m.user_id === uid && m.status === "active" && db.tenants.find((t) => t.id === m.tenant_id)?.status === "active")
      .map((m) => {
        const t = db.tenants.find((x) => x.id === m.tenant_id);
        return { tenant_id: t.id, slug: t.slug, name: t.name, role: m.role, permissions: permissionsOf(m) };
      }),
  am_i_platform_admin: (_a, uid) => isPlatform(uid),
  accept_my_invitations: () => 0,
  resolve_tenant_by_slug: (a) => resolved(db.tenants.find((t) => t.slug === a.p_slug)),
  resolve_tenant_by_host: (a) => {
    const d = db.tenant_domains.find((x) => x.hostname === a.p_host && x.status === "verified");
    return resolved(d && db.tenants.find((t) => t.id === d.tenant_id));
  },
  can_upload_public_asset: (a, uid) => (a.p_name.includes("/branding/") ? has(uid, "settings.manage") : has(uid, "inventory.manage")),
  room_type_capacity: (_a, uid) => capacity(uid),
  import_inventory: importInventory,
  invite_staff_member: (a, uid) => {
    if (!has(uid, "staff.manage")) refuse("42501");
    return invite(a.p_tenant_id, a.p_email, a.p_role, a.p_permission_set_id);
  },
  change_member_role: (a, uid) => {
    if (!has(uid, "staff.manage")) refuse("42501");
    const m = db.tenant_memberships.find((x) => x.id === a.p_membership_id);
    if (m.user_id === uid) refuse("42501");
    Object.assign(m, { role: a.p_role, permission_set_id: a.p_permission_set_id });
    return null;
  },
  revoke_membership: (a, uid) => {
    if (!has(uid, "staff.manage")) refuse("42501");
    db.tenant_memberships.find((x) => x.id === a.p_membership_id).status = "revoked";
    return null;
  },
  create_tenant: (a, uid) => {
    requirePlatform(uid);
    if (db.tenants.some((t) => t.slug === a.p_slug || t.reference_prefix === a.p_reference_prefix)) refuse("23505");
    const tenantId = randomUUID();
    db.tenants.push({ id: tenantId, name: a.p_name, legal_name: a.p_legal_name, slug: a.p_slug, reference_prefix: a.p_reference_prefix, status: "onboarding", suspended_at: null, suspension_reason: null, created_at: new Date().toISOString() });
    db.tenant_profiles.push({ ...db.tenant_profiles[0], tenant_id: tenantId, display_name: a.p_name, is_published: false });
    invite(tenantId, a.p_admin_email, "hostel_admin", null);
    return tenantId;
  },
  platform_hostel_admin_invitations: (a, uid) => {
    requirePlatform(uid);
    return db.tenant_memberships
      .filter((m) => m.tenant_id === a.p_tenant_id && m.role === "hostel_admin" && m.status !== "revoked")
      .map((m) => ({ membership_id: m.id, email: m.invited_email, status: m.status, accepted_at: m.accepted_at }));
  },
  platform_invite_hostel_admin: (a, uid) => {
    requirePlatform(uid);
    return invite(a.p_tenant_id, a.p_email, "hostel_admin", null);
  },
  set_tenant_status: (a, uid) => {
    requirePlatform(uid);
    const t = db.tenants.find((x) => x.id === a.p_tenant_id);
    Object.assign(t, { status: a.p_status, suspended_at: a.p_status === "suspended" ? new Date().toISOString() : null, suspension_reason: a.p_status === "suspended" ? a.p_reason : null });
    return null;
  },
  add_custom_domain: (a, uid) => {
    requirePlatform(uid);
    if (db.tenant_domains.some((d) => d.hostname === a.p_hostname && d.status !== "removed")) refuse("23505");
    const domainId = randomUUID();
    db.tenant_domains.push({ id: domainId, tenant_id: a.p_tenant_id, hostname: a.p_hostname, kind: "custom", status: "pending", is_primary: false, verification: null, last_checked_at: null });
    return domainId;
  },
  set_domain_status: (a, uid) => {
    requirePlatform(uid);
    const d = domain(a.p_domain_id);
    if (d.is_primary && a.p_status !== "verified") refuse("22023");
    d.status = a.p_status;
    return null;
  },
  set_primary_domain: (a, uid) => {
    requirePlatform(uid);
    const d = domain(a.p_domain_id);
    if (d.status !== "verified") refuse("22023");
    db.tenant_domains.filter((x) => x.tenant_id === d.tenant_id).forEach((x) => { x.is_primary = false; });
    d.is_primary = true;
    return null;
  },
  remove_domain: (a, uid) => {
    requirePlatform(uid);
    const d = domain(a.p_domain_id);
    if (d.is_primary) refuse("22023");
    d.status = "removed";
    return null;
  },
};

function matches(row, url) {
  for (const [key, value] of url.searchParams) {
    if (["select", "order", "limit", "offset", "columns", "or"].includes(key)) continue;
    if (value.startsWith("eq.") && String(row[key]) !== value.slice(3)) return false;
    if (value.startsWith("neq.") && String(row[key]) === value.slice(4)) return false;
    if (value === "is.null" && row[key] != null) return false;
    if (value.startsWith("in.(") && !value.slice(4, -1).split(",").map((x) => x.replaceAll('"', "")).includes(String(row[key]))) return false;
    if (value.startsWith("ilike.") && !String(row[key]).toLowerCase().includes(value.slice(6).replace(/[%*]/g, "").toLowerCase())) return false;
  }
  return true;
}

function visible(table, uid) {
  const rows = db[table];
  if (["rooms", "beds", "bed_blocks"].includes(table)) return canSeeRooms(uid) ? rows : [];
  if (table === "tenants" || table === "tenant_domains") return isPlatform(uid) ? rows : [];
  if (table === "tenant_settings") return has(uid, "settings.read") || has(uid, "settings.manage") ? rows : [];
  if (table === "tenant_memberships") return has(uid, "staff.manage") ? rows.filter((m) => m.tenant_id === T) : [];
  if (table === "tenant_profiles") {
    const member = activeMembership(uid);
    return rows.filter((p) => p.tenant_id === member?.tenant_id || (p.is_published && db.tenants.find((t) => t.id === p.tenant_id)?.status === "active"));
  }
  if (table === "platform_admins") return rows.filter((r) => r.user_id === uid);
  return rows;
}

const WRITE_PERMISSION = {
  booking_periods: "inventory.manage", room_types: "inventory.manage", room_type_photos: "inventory.manage", rooms: "inventory.manage", beds: "inventory.manage", bed_blocks: "inventory.manage",
  room_type_prices: "pricing.manage", tenant_profiles: "settings.manage", tenant_settings: "settings.manage", permission_sets: "staff.manage",
};

function constraint(table, row, uid) {
  if (!WRITE_PERMISSION[table] || !has(uid, WRITE_PERMISSION[table])) return "42501";
  const clash = (key, scope = () => true) => db[table].some((r) => r[key] === row[key] && r.id !== row.id && scope(r));
  if (table === "rooms" && clash("label")) return "23505";
  if (table === "room_types" && clash("slug")) return "23505";
  if (table === "booking_periods" && clash("name")) return "23505";
  if (table === "permission_sets" && clash("key")) return "23505";
  if (table === "beds") {
    if (clash("label", (r) => r.room_id === row.room_id)) return "23505";
    const room = db.rooms.find((r) => r.id === row.room_id);
    const type = db.room_types.find((t) => t.id === room?.room_type_id);
    if (!row.id && type && db.beds.filter((b) => b.room_id === row.room_id && b.status !== "retired").length >= type.occupancy) return "23514";
  }
  return null;
}

function present(table, row) {
  if (table === "rooms") return { ...row, beds: db.beds.filter((b) => b.room_id === row.id) };
  if (table === "beds") return { ...row, bed_blocks: db.bed_blocks.filter((x) => x.bed_id === row.id).map((x) => ({ ...x, blocked: `[${x.start},${nextDay(x.end)})` })) };
  return row;
}

function removeRows(table, rows) {
  if (table === "room_types" && rows.some((t) => db.rooms.some((r) => r.room_type_id === t.id))) return "23503";
  if (table === "permission_sets" && rows.some((s) => db.tenant_memberships.some((m) => m.permission_set_id === s.id && m.status !== "revoked"))) return "23503";
  if (table === "rooms") {
    const beds = db.beds.filter((b) => rows.some((r) => r.id === b.room_id));
    if (beds.some((b) => db.bed_blocks.some((x) => x.bed_id === b.id))) return "23503";
    beds.forEach((b) => db.beds.splice(db.beds.indexOf(b), 1));
  }
  if (table === "beds" && rows.some((b) => db.bed_blocks.some((x) => x.bed_id === b.id))) return "23503";
  rows.forEach((r) => db[table].splice(db[table].indexOf(r), 1));
  return null;
}

function handleTable(req, res, url, raw, table) {
  const uid = subject(req);
  if (req.method === "GET" || req.method === "HEAD") {
    let rows = visible(table, uid).filter((r) => matches(r, url));
    const count = rows.length;
    if (url.searchParams.get("order")?.startsWith("label")) rows = [...rows].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = url.searchParams.get("limit");
    if (limit) rows = rows.slice(offset, offset + Number(limit));
    const headers = { "content-range": `${rows.length ? `${offset}-${offset + rows.length - 1}` : "*"}/${count}` };
    if (req.method === "HEAD") {
      res.writeHead(200, headers);
      return res.end();
    }
    const out = rows.map((r) => present(table, r));
    if ((req.headers.accept ?? "").includes("vnd.pgrst.object")) return out[0] ? send(res, out[0]) : fail(res, 406, "PGRST116");
    return send(res, out, 200, headers);
  }
  const status = (code) => (code === "42501" ? 403 : 409);
  if (req.method === "POST") {
    const body = JSON.parse(raw);
    if (table === "bed_blocks") {
      const m = /^\[(.+),(.+)\]$/.exec(body.blocked);
      Object.assign(body, { start: m[1], end: m[2] });
      if (db.bed_blocks.some((x) => x.bed_id === body.bed_id && !x.released_at && x.start <= body.end && x.end >= body.start)) return fail(res, 409, "23P01");
    }
    const problem = constraint(table, body, uid);
    if (problem) return fail(res, status(problem), problem);
    const row = { id: randomUUID(), sort_order: 0, is_system: false, ...body };
    db[table].push(row);
    return send(res, [row], 201);
  }
  const rows = visible(table, uid).filter((r) => matches(r, url));
  if (req.method === "PATCH") {
    const body = JSON.parse(raw);
    for (const r of rows) {
      const problem = constraint(table, { ...r, ...body }, uid);
      if (problem) return fail(res, status(problem), problem);
    }
    rows.forEach((r) => Object.assign(r, body));
    return send(res, rows);
  }
  if (req.method === "DELETE") {
    if (!has(uid, WRITE_PERMISSION[table])) return send(res, []);
    const problem = removeRows(table, [...rows]);
    return problem ? fail(res, 409, problem) : send(res, rows);
  }
  return fail(res, 405, "method");
}

http
  .createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      const url = new URL(req.url, "http://localhost");
      const path = url.pathname;
      if (path === "/__health") return send(res, { ok: true });
      if (path === "/__reset") {
        seed();
        return send(res, {});
      }
      if (path === "/__state") return send(res, { db, objects: [...objects.keys()] });
      if (path === "/auth/v1/user") {
        const uid = subject(req);
        const needsFactor = uid === USERS.platform || db.tenant_memberships.some((m) => m.user_id === uid && m.role === "hostel_admin");
        return send(res, {
          id: uid, aud: "authenticated", role: "authenticated", email: `${uid}@alder.test`, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z",
          factors: needsFactor ? [{ id: "10000000-0000-4000-8000-000000000001", factor_type: "totp", status: "verified", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }] : [],
        });
      }
      if (path.endsWith("/jwks.json")) return send(res, { keys: [] });
      if (path === "/auth/v1/invite") return send(res, { id: randomUUID(), email: JSON.parse(raw).email });
      const PUBLIC = "/storage/v1/object/public/tenant-public/";
      if (path.startsWith(PUBLIC)) {
        const body = objects.get(decodeURIComponent(path.slice(PUBLIC.length)));
        if (!body) return fail(res, 404, "not_found");
        res.writeHead(200, { "content-type": "image/webp" });
        return res.end(body);
      }
      if (path === "/storage/v1/object/tenant-public" && req.method === "DELETE") {
        for (const name of JSON.parse(raw).prefixes) objects.delete(name);
        return send(res, []);
      }
      if (path.startsWith("/storage/v1/object/tenant-public/")) {
        const name = decodeURIComponent(path.slice("/storage/v1/object/tenant-public/".length));
        const start = raw.indexOf(Buffer.from("RIFF"));
        objects.set(name, start >= 0 ? raw.subarray(start) : raw);
        return send(res, { Id: randomUUID(), Key: `tenant-public/${name}` });
      }
      if (path.startsWith("/rest/v1/rpc/")) {
        const fn = RPC[path.slice("/rest/v1/rpc/".length)];
        if (!fn) return fail(res, 404, "PGRST202");
        try {
          return send(res, fn(raw.length ? JSON.parse(raw) : {}, subject(req)));
        } catch (error) {
          return typeof error === "string" ? fail(res, 400, error) : fail(res, 500, "XX000");
        }
      }
      if (path.startsWith("/rest/v1/")) {
        const table = path.slice("/rest/v1/".length);
        return db[table] ? handleTable(req, res, url, raw, table) : fail(res, 404, "42P01");
      }
      return fail(res, 404, "not_found");
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`fake supabase on ${PORT}`));
