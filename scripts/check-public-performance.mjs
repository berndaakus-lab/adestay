// Phase 3 acceptance criterion 6: public pages on simulated slow 4G (Lighthouse mobile).
// Run `npm run build`, then `npm run test:perf`. Needs no keys and is not part of CI.
//
// Uses the production build against the local fake API with made-up content. A proxy adds delay to
// every uncached database call, because a local API would otherwise answer unrealistically fast.
// The image optimizer refuses local addresses, so photos are stored at the 750 px width it would
// serve to this phone. In production photos come from the app's own domain (/_next/image, cached
// at the edge), so a front server puts pages, photos and the fake API on one origin. Photos skip
// the database delay; PERF_PHOTO_DELAY=1 delays them too (stricter). This is a lab result: it does
// not measure Vercel, hosted Supabase, the real image optimizer or a real phone network.
import { execFileSync, spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { chromium } from "@playwright/test";
import lighthouse from "lighthouse";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const APP_PORT = 3200;
const FAKE_PORT = 54397;
const PROXY_PORT = 54396;
const CHROME_PORT = 9334;
const FRONT_PORT = 3201;
const API_PATH = /^\/(rest|auth)\/v1\//;
const PHOTO_PATH = /^\/storage\/v1\//;
const PHOTO_DELAY = process.env.PERF_PHOTO_DELAY === "1";
const API_DELAY_MS = Number(process.env.PERF_API_DELAY_MS ?? 150);
// "simulate" (Lighthouse's default) estimates the slow network; "devtools" actually applies it.
const THROTTLING = process.env.PERF_THROTTLING === "devtools" ? "devtools" : "simulate";
const RUNS = 5;
const MAX_LCP_MS = 2500;
const MIN_SCORE = 85;

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SITE = "/sites/alder-house";
const PAGES = [
  ["Home", SITE],
  ["Rooms", `${SITE}/rooms`],
  ["Room details", `${SITE}/rooms/two-in-a-room`],
  ["Policies", `${SITE}/policies`],
  ["Contact", `${SITE}/contact`],
  ["Booking status", `${SITE}/booking-status`],
  ["Request a room", `${SITE}/book?room=two-in-a-room`],
];

const children = [];
const start = (args, env) => {
  const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, stdio: "ignore" });
  children.push(child);
  return child;
};
const stop = (child) => {
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill();
  } catch {
    // Already stopped.
  }
};

async function waitFor(url) {
  for (let i = 0; i < 120; i++) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`${url} did not start`);
}

const proxy = http.createServer((req, res) => {
  setTimeout(() => {
    const upstream = http.request({ host: "127.0.0.1", port: FAKE_PORT, path: req.url, method: req.method, headers: req.headers }, (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    });
    upstream.on("error", () => res.destroy());
    req.pipe(upstream);
  }, API_DELAY_MS);
});

async function photo(width, height) {
  return sharp({ create: { width, height, channels: 3, background: "#8a7f6d", noise: { type: "gaussian", mean: 128, sigma: 28 } } })
    .blur(1.2)
    .webp({ quality: 72 })
    .toBuffer();
}

async function seed() {
  const fake = `http://127.0.0.1:${FAKE_PORT}`;
  await fetch(`${fake}/__reset`);
  await fetch(`${fake}/__seed-public`);
  const hero = await photo(750, 500);
  const room = await photo(750, 563);
  const logo = await photo(96, 96);
  const files = {
    [`${TENANT}/branding/hero-0001.webp`]: hero,
    [`${TENANT}/room-types/20000000-0000-4000-8000-000000000001/photo-0001.webp`]: room,
    [`${TENANT}/branding/logo-0001.webp`]: logo,
  };
  for (const [name, body] of Object.entries(files)) {
    await fetch(`${fake}/storage/v1/object/tenant-public/${name}`, { method: "POST", body });
  }
  console.log(`Photos: hero ${Math.round(hero.length / 1024)} KB, room ${Math.round(room.length / 1024)} KB. Database delay: ${API_DELAY_MS} ms per call${PHOTO_DELAY ? ", photos too" : ""}.`);
}

// Database and auth calls go through the delay proxy, photos to the fake store, the rest to the app.
const front = http.createServer((req, res) => {
  const url = req.url ?? "";
  const photoPort = PHOTO_DELAY ? PROXY_PORT : FAKE_PORT;
  const port = PHOTO_PATH.test(url) ? photoPort : API_PATH.test(url) ? PROXY_PORT : APP_PORT;
  const upstream = http.request({ host: "127.0.0.1", port, path: req.url, method: req.method, headers: req.headers }, (answer) => {
    res.writeHead(answer.statusCode ?? 502, answer.headers);
    answer.pipe(res);
  });
  upstream.on("error", () => res.destroy());
  req.pipe(upstream);
});

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

let failed = false;
let browser;
try {
  start(["tests/e2e-admin/fake-supabase.mjs"], { FAKE_SUPABASE_PORT: String(FAKE_PORT) });
  await waitFor(`http://127.0.0.1:${FAKE_PORT}/__health`);
  await new Promise((resolve) => proxy.listen(PROXY_PORT, "127.0.0.1", resolve));
  await new Promise((resolve) => front.listen(FRONT_PORT, "127.0.0.1", resolve));
  start([path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", String(APP_PORT)], {
    NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${FRONT_PORT}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fake-anon-key-for-local-perf-only",
    SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-for-local-perf-only",
    LOG_REDACTION_SALT: "fake-lookup-secret-for-local-perf-only",
  });
  await waitFor(`http://localhost:${APP_PORT}`);
  await waitFor(`http://localhost:${FRONT_PORT}`);
  await seed();
  browser = await chromium.launch({ headless: true, args: [`--remote-debugging-port=${CHROME_PORT}`] });

  console.log(`\nPage                 LCP (ms)   Score   Runs: ${RUNS}, slow 4G (${THROTTLING}), mobile`);
  for (const [name, pagePath] of PAGES) {
    // Warm-up: the first visit to a page fills the cache, as it would for any earlier visitor.
    for (let i = 0; i < 2; i++) {
      await fetch(`http://localhost:${FRONT_PORT}${pagePath}`).then((r) => r.text());
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    const lcps = [];
    const scores = [];
    for (let run = 0; run < RUNS; run++) {
      const result = await lighthouse(`http://localhost:${FRONT_PORT}${pagePath}`, { port: CHROME_PORT, output: "json", logLevel: "error", onlyCategories: ["performance"], throttlingMethod: THROTTLING });
      const lcp = result?.lhr.audits["largest-contentful-paint"].numericValue;
      const score = result?.lhr.categories.performance.score;
      if (lcp == null || score == null) throw new Error(`Lighthouse returned no result for ${pagePath}: ${result?.lhr.runtimeError?.code ?? "unknown"}`);
      lcps.push(lcp);
      scores.push(score * 100);
    }
    const lcp = Math.round(median(lcps));
    const score = Math.round(median(scores));
    const ok = lcp < MAX_LCP_MS && score >= MIN_SCORE;
    failed ||= !ok;
    console.log(`${name.padEnd(20)} ${String(lcp).padStart(8)} ${String(score).padStart(7)}   ${ok ? "pass" : "FAIL"}`);
  }
} finally {
  await browser?.close().catch(() => {});
  proxy.close();
  front.close();
  children.forEach(stop);
}
console.log(failed ? `\nFailed: needs LCP under ${MAX_LCP_MS} ms and a score of at least ${MIN_SCORE}.` : "\nAll pages passed.");
process.exit(failed ? 1 : 0);
