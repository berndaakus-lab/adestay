import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { apiState, audit, dialog, NOT_FOUND, open, resetData, SETTINGS, signIn, submitDialog } from "./helpers";

test.beforeEach(async () => {
  await resetData();
});

test("hostel admin edits the profile and uploads images", async ({ page, context }) => {
  await signIn(context, "admin");
  await open(page, SETTINGS);
  await expect(page.getByLabel("Hostel name")).toHaveValue("Alder House");
  await audit(page, "profile");

  // Criterion 3
  const colour = page.getByRole("textbox", { name: /Main colour/ });
  await colour.fill("#b69a61");
  await expect(page.getByText("Too light to read")).toBeVisible();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("This colour is too light to read")).toBeVisible();
  await page.getByLabel("Phone", { exact: false }).first().fill("123");
  await page.getByLabel("Tagline").fill("Kept value");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Enter a phone number like")).toBeVisible();
  await expect(page.getByLabel("Tagline"), "typed value survives a failed submit").toHaveValue("Kept value");
  await audit(page, "profile errors");

  await colour.fill("#2f5d74");
  await page.getByLabel("Phone", { exact: false }).first().fill("024 123 4567");
  await page.getByLabel("Ghana Post GPS").fill("ga-123-4567");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText(/Profile saved/)).toBeVisible();
  const saved = (await apiState()).db.tenant_profiles[0];
  expect(saved).toMatchObject({ contact_phone: "+233241234567", digital_address: "GA-123-4567", primary_color: "#2f5d74" });

  // Criterion 4
  const logo = page.locator("#branding-logo");
  await logo.setInputFiles({ name: "fake.jpg", mimeType: "image/jpeg", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>') });
  await page.getByRole("button", { name: "Upload logo" }).click();
  await expect(page.getByText("Upload a JPEG, PNG or WebP image.")).toBeVisible();
  await logo.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
  await page.getByRole("button", { name: "Upload logo" }).click();
  await expect(page.getByText("Upload a JPEG, PNG or WebP image.")).toBeVisible();
  expect((await apiState()).objects).toEqual([]);

  const jpeg = await sharp({ create: { width: 300, height: 120, channels: 3, background: "#234536" } }).withExif({ IFD0: { Copyright: "exif-marker" } }).jpeg().toBuffer();
  await logo.setInputFiles({ name: "logo.jpg", mimeType: "image/jpeg", buffer: jpeg });
  await page.getByRole("button", { name: "Upload logo" }).click();
  const image = page.getByRole("img", { name: "Current logo" });
  await expect(image).toBeVisible();
  const state = await apiState();
  expect(state.objects[0]).toMatch(/\/branding\/logo-[0-9a-f]{24}\.webp$/);
  const stored = Buffer.from(await (await page.request.get((await image.getAttribute("src"))!)).body());
  expect((await sharp(stored).metadata()).format).toBe("webp");
  expect(stored.includes("exif-marker"), "EXIF is stripped").toBe(false);

  const big = await sharp({ create: { width: 2600, height: 1800, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 60 } } }).png({ compressionLevel: 1 }).toBuffer();
  expect(big.length).toBeGreaterThan(4 * 1024 * 1024);
  await page.locator("#branding-hero").setInputFiles({ name: "hero.png", mimeType: "image/png", buffer: big });
  await page.getByRole("button", { name: "Upload main photo" }).click();
  await expect(page.getByRole("img", { name: "Current main photo" }), "a large photo is shrunk and uploaded").toBeVisible({ timeout: 60_000 });
  await audit(page, "profile with images");

  await page.getByRole("button", { name: "Remove logo" }).click();
  await expect(page.getByRole("img", { name: "Current logo" })).toHaveCount(0);
  await page.getByRole("button", { name: "Remove main photo" }).click();
  await expect(page.getByRole("img", { name: "Current main photo" })).toHaveCount(0);
  expect((await apiState()).objects).toEqual([]);
});

test("hostel admin sets booking rules", async ({ page, context }) => {
  await signIn(context, "admin");
  await open(page, `${SETTINGS}/operations`);
  await audit(page, "booking rules");
  await page.getByLabel("Hold period (days)").fill("20");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Hold period must be at most 14")).toBeVisible();
  await page.getByLabel("Hold period (days)").fill("7");
  await page.getByLabel("Deposit", { exact: true }).selectOption("percent");
  await page.getByLabel("Deposit (%)").fill("30");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  expect((await apiState()).db.tenant_settings[0]).toMatchObject({ hold_duration_hours: 168, deposit_policy: "percent", deposit_value: 30 });
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByLabel("Deposit (%)")).toHaveValue("30");
});

test("hostel admin manages the team and permission sets", async ({ page, context }) => {
  await signIn(context, "admin");
  await open(page, `${SETTINGS}/team`);
  await expect(page.getByText("You", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Change role of Abena/ }), "no actions on your own row").toHaveCount(0);
  await audit(page, "team");

  const email = "new@alder.test";
  await page.getByLabel("Email address").fill("nope");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText("Enter a valid email")).toBeVisible();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Permission set").selectOption({ label: "Front Desk" });
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(email).first()).toBeVisible();
  await page.getByRole("button", { name: `Resend invitation to ${email}` }).click();
  await expect(page.getByText(/Invitation saved/).first()).toBeVisible();

  await page.getByRole("button", { name: `Change role of ${email}` }).click();
  await dialog(page).getByLabel("Permission set").selectOption({ label: "Manager" });
  await audit(page, "role dialog");
  await submitDialog(page, "Save role");
  const invited = (await apiState()).db.tenant_memberships.find((m) => m.invited_email === email);
  expect(invited.permission_set_id).toBe("90000000-0000-4000-8000-000000000002");

  await page.getByRole("listitem").filter({ hasText: email }).getByRole("button", { name: "Cancel invitation" }).click();
  await dialog(page).getByLabel("Reason").fill("Wrong person");
  await submitDialog(page, "Cancel invitation");
  await expect(page.getByText(email)).toHaveCount(0);

  await open(page, `${SETTINGS}/permissions`);
  await audit(page, "permission sets");
  await expect(page.locator('input[value="staff.manage"], input[value="payments.configure"]'), "never delegable").toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit Manager" }), "built-in sets are locked").toHaveCount(0);
  await page.getByLabel("Start from").selectOption({ label: "Manager" });
  await expect(page.locator('input[name="permissions"][value="inventory.manage"]')).toBeChecked();
  await page.getByLabel("Name", { exact: true }).fill("Porter");
  await page.getByRole("button", { name: "Create permission set" }).click();
  await page.getByRole("button", { name: "Edit Porter" }).click();
  await audit(page, "edit set dialog");
  await dialog(page).locator('input[value="reports.read"]').check();
  await submitDialog(page, "Save changes");
  expect((await apiState()).db.permission_sets.find((s) => s.name === "Porter").permissions).toContain("reports.read");
  await page.getByRole("button", { name: "Delete Porter" }).click();
  await expect(page.getByRole("button", { name: "Edit Porter" })).toHaveCount(0);
});

test("settings follow permissions", async ({ page, context }) => {
  await signIn(context, "manager");
  await open(page, SETTINGS);
  await expect(page.getByLabel("Hostel name"), "settings.read is read-only").toBeDisabled();
  await expect(page.getByRole("button", { name: "Save profile" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Team" })).toHaveCount(0);
  await audit(page, "read-only profile");
  await open(page, `${SETTINGS}/operations`);
  await expect(page.getByLabel("Hold period (days)")).toBeDisabled();
  for (const section of ["team", "permissions"]) {
    await open(page, `${SETTINGS}/${section}`);
    await expect(page.getByText(NOT_FOUND)).toBeVisible();
  }

  await signIn(context, "desk");
  await open(page, SETTINGS);
  await expect(page.getByText(NOT_FOUND)).toBeVisible();
  await open(page, "/t/alder-house");
  await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);

  await signIn(context, "admin", "aal1");
  await open(page, SETTINGS);
  await expect(page, "an admin without MFA must verify").toHaveURL(/\/mfa\/verify/);
});
