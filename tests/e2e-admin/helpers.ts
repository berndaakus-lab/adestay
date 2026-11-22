import AxeBuilder from "@axe-core/playwright";
import { expect, type BrowserContext, type Page } from "@playwright/test";

const API = "http://127.0.0.1:54399";
const USERS = {
  platform: "e1",
  admin: "a1",
  manager: "a2",
  desk: "a3",
  pricer: "a4",
  accounts: "a5",
  suspended: "c1",
} as const;
export type Who = keyof typeof USERS;

export const SETTINGS = "/t/alder-house/settings";
export const INVENTORY = "/t/alder-house/inventory";
export const NOT_FOUND = "We could not find that page";

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** A session cookie in the shape @supabase/ssr reads. The fake API accepts its unsigned token. */
export async function signIn(context: BrowserContext, who: Who, aal: "aal1" | "aal2" = "aal2") {
  const id = `00000000-0000-4000-8000-0000000000${USERS[who]}`;
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const user = { id, aud: "authenticated", role: "authenticated", email: `${who}@alder.test`, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: id, email: user.email, role: "authenticated", aud: "authenticated", aal, amr: [], session_id: "e2e", exp, iat: exp - 60 })}.e2e`;
  const value = `base64-${b64({ access_token: token, refresh_token: "e2e", token_type: "bearer", expires_in: 3600, expires_at: exp, user })}`;
  await context.clearCookies();
  await context.addCookies([{ name: "sb-127-auth-token", value, url: "http://localhost:3100" }]);
}

export const resetData = async () => {
  await fetch(`${API}/__reset`);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const apiState = async (): Promise<{ db: Record<string, any[]>; objects: string[] }> => (await fetch(`${API}/__state`)).json();

/** WCAG 2.2 AA with axe, plus no sideways scrolling. */
export async function audit(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(violations.map((v) => `${label}: ${v.id} ${v.nodes[0]?.target}`)).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(0);
}

export const open = (page: Page, path: string) => page.goto(path, { waitUntil: "networkidle" });
export const dialog = (page: Page) => page.getByRole("dialog");

export async function submitDialog(page: Page, button: string) {
  await dialog(page).getByRole("button", { name: button, exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
}

/** Waits for the closing animation, so the next dialog is not confused with this one. */
export async function cancelDialog(page: Page) {
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
  await expect(dialog(page)).toHaveCount(0);
}
