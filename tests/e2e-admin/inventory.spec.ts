import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { apiState, audit, cancelDialog, dialog, INVENTORY, NOT_FOUND, open, resetData, signIn, submitDialog } from "./helpers";

const CSV_HEADER = "room_type,room,block,floor,beds";

async function addPeriod(page: Page) {
  await open(page, `${INVENTORY}/periods`);
  await page.getByRole("button", { name: "Add period" }).click();
  await dialog(page).getByLabel("Name").fill("2026/27 Year");
  await dialog(page).getByLabel("First day").fill("2026-09-01");
  await dialog(page).getByLabel("Last day").fill("2027-07-31");
  await dialog(page).getByLabel("Status").selectOption("open");
  await submitDialog(page, "Add period");
  await expect(page.getByText("2026/27 Year")).toBeVisible();
}

async function addType(page: Page, name: string, beds: string) {
  await page.getByRole("button", { name: "Add room type" }).click();
  await dialog(page).getByLabel("Name", { exact: true }).fill(name);
  await dialog(page).getByLabel("Beds per room").fill(beds);
  await submitDialog(page, "Add room type");
  await expect(page.getByRole("button", { name: `Edit ${name}` })).toBeVisible();
}

test.beforeEach(async () => {
  await resetData();
});

test("hostel admin models 50 beds and sees sellable capacity", async ({ page, context }) => {
  await signIn(context, "admin");
  await open(page, INVENTORY);
  await expect(page.getByRole("heading", { name: "Set up this hostel" })).toBeVisible();
  await audit(page, "empty capacity");

  await open(page, `${INVENTORY}/periods`);
  await audit(page, "empty periods");
  await page.getByRole("button", { name: "Add period" }).click();
  await audit(page, "period dialog");
  await dialog(page).getByLabel("Name").fill("Backwards");
  await dialog(page).getByLabel("First day").fill("2026-09-01");
  await dialog(page).getByLabel("Last day").fill("2026-08-01");
  await dialog(page).getByRole("button", { name: "Add period" }).click();
  await expect(dialog(page).getByText("The end date must be after the start date")).toBeVisible();
  await cancelDialog(page);
  await addPeriod(page);

  await open(page, `${INVENTORY}/room-types`);
  await page.getByRole("button", { name: "Add room type" }).click();
  await dialog(page).getByLabel("Name", { exact: true }).fill("Too many");
  await dialog(page).getByLabel("Beds per room").fill("13");
  await dialog(page).getByRole("button", { name: "Add room type" }).click();
  await expect(dialog(page).getByText("Beds per room must be at most 12")).toBeVisible();
  await cancelDialog(page);
  await addType(page, "Double", "2");
  await addType(page, "Quad", "4");

  // Room photo: description required, disguised SVG refused, real image stored.
  await page.getByText("Photos (0)").first().click();
  const panel = page.locator("main details").first();
  const photo = await sharp({ create: { width: 640, height: 360, channels: 3, background: "#234536" } }).jpeg().toBuffer();
  await panel.locator('input[type="file"]').setInputFiles({ name: "room.jpg", mimeType: "image/jpeg", buffer: photo });
  await panel.getByRole("button", { name: /Upload photo/ }).click();
  await expect(panel.getByText("Describe the photo for screen readers")).toBeVisible();
  await panel.locator('input[type="file"]').setInputFiles({ name: "room.jpg", mimeType: "image/jpeg", buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") });
  await panel.getByLabel("Describe the photo").fill("Two beds by a window");
  await panel.getByRole("button", { name: /Upload photo/ }).click();
  await expect(panel.getByText("Upload a JPEG, PNG or WebP image.")).toBeVisible();
  expect((await apiState()).objects).toEqual([]);
  await panel.locator('input[type="file"]').setInputFiles({ name: "room.jpg", mimeType: "image/jpeg", buffer: photo });
  await panel.getByLabel("Describe the photo").fill("Two beds by a window");
  await panel.getByRole("button", { name: /Upload photo/ }).click();
  await expect(page.getByRole("img", { name: "Two beds by a window" })).toBeVisible();
  await audit(page, "room types with photo");
  await page.getByRole("button", { name: "Delete photo: Two beds by a window" }).click();
  await submitDialog(page, "Delete photo");
  await expect(page.getByRole("img", { name: "Two beds by a window" })).toHaveCount(0);
  expect((await apiState()).objects).toEqual([]);

  // One room by hand, with beds, a block and a bed in maintenance.
  await open(page, `${INVENTORY}/rooms`);
  await audit(page, "empty rooms");
  await page.getByRole("button", { name: "Add room" }).first().click();
  await dialog(page).getByLabel("Room number").fill("R-1");
  await dialog(page).getByLabel("Room type").selectOption({ label: "Double (2 beds)" });
  await submitDialog(page, "Add room");
  await page.getByRole("link", { name: /R-1/ }).click();
  await expect(page.getByRole("heading", { name: /Room R-1/ })).toBeVisible();
  for (const label of ["A", "B"]) {
    await page.getByRole("button", { name: "Add bed" }).click();
    await expect(dialog(page).getByLabel("Bed label")).toHaveValue(label);
    await submitDialog(page, "Add bed");
    await expect(page.getByRole("button", { name: `Edit bed ${label}` })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Add bed" }), "occupancy is full").toHaveCount(0);

  await page.getByRole("button", { name: "Block dates for bed A" }).click();
  await audit(page, "block dialog");
  await dialog(page).getByLabel("First day").fill("2026-10-01");
  await dialog(page).getByLabel("Last day").fill("2026-10-15");
  await dialog(page).getByLabel("Reason").fill("Ceiling leak");
  await submitDialog(page, "Block bed");
  await expect(page.getByText(/Blocked 1 Oct 2026 to 15 Oct 2026/)).toBeVisible();
  await page.getByRole("button", { name: "Block dates for bed A" }).click();
  await dialog(page).getByLabel("First day").fill("2026-10-10");
  await dialog(page).getByLabel("Last day").fill("2026-10-20");
  await dialog(page).getByLabel("Reason").fill("Overlap");
  await dialog(page).getByRole("button", { name: "Block bed" }).click();
  await expect(dialog(page).getByText("already blocked")).toBeVisible();
  await cancelDialog(page);
  await audit(page, "room detail");
  const roomUrl = page.url();
  await open(page, INVENTORY);
  await expect(page.getByText("1 sellable bed.")).toBeVisible();
  await open(page, roomUrl);
  await page.getByRole("button", { name: /Release block on bed A/ }).click();
  await submitDialog(page, "Release block");
  await expect(page.getByText("Ceiling leak")).toHaveCount(0);
  expect((await apiState()).db.bed_blocks[0].released_at).toBeTruthy();
  await page.getByRole("button", { name: "Edit bed B" }).click();
  await dialog(page).getByLabel("Status").selectOption("maintenance");
  await submitDialog(page, "Save bed");
  await expect(page.getByText("In maintenance")).toBeVisible();

  // Prices in cedis, stored in pesewas.
  await open(page, `${INVENTORY}/prices`);
  await audit(page, "prices");
  await page.getByLabel("Price for Double (GH₵)").fill("4,500.00");
  await page.getByLabel("Deposit for Double (GH₵)").fill("5,000");
  await page.getByRole("button", { name: "Save price for Double" }).click();
  await expect(page.getByText("The deposit cannot be more than the price")).toBeVisible();
  await page.getByLabel("Deposit for Double (GH₵)").fill("1,000");
  await page.getByRole("button", { name: "Save price for Double" }).click();
  await expect(page.getByRole("button", { name: "Remove price for Double" })).toBeVisible();
  expect((await apiState()).db.room_type_prices[0]).toMatchObject({ amount_minor: 450000, deposit_minor: 100000 });

  // CSV: errors by line, preview writes nothing, then 48 more beds.
  await open(page, `${INVENTORY}/import`);
  await audit(page, "import");
  const file = page.locator("#import-file");
  await file.setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from(`${CSV_HEADER}\nNope,X-1,,,2\nDouble,R-1,,,2\nDouble,X-3,,,3\n`) });
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByText("No room type with this name")).toBeVisible();
  await expect(page.getByText("Line 4")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Import / })).toHaveCount(0);
  await audit(page, "import errors");

  const lines = [CSV_HEADER];
  for (let i = 1; i <= 8; i += 1) lines.push(`Quad,Q-${i},Q,1,4`);
  for (let i = 1; i <= 8; i += 1) lines.push(`Double,D-${i},D,2,Left;Right`);
  await file.setInputFiles({ name: "good.csv", mimeType: "text/csv", buffer: Buffer.from(`﻿${lines.join("\r\n")}\r\n`) });
  await expect(page.getByText("No room type with this name"), "a new file clears old results").toHaveCount(0);
  await page.getByRole("button", { name: "Preview import" }).click();
  const confirm = page.getByRole("button", { name: "Import 16 rooms and 48 beds" });
  await expect(confirm).toBeVisible();
  expect((await apiState()).db.rooms).toHaveLength(1);
  await audit(page, "import preview");
  await confirm.click();
  await expect(page.getByText("Added 16 rooms and 48 beds.")).toBeVisible();
  const state = await apiState();
  expect(state.db.rooms).toHaveLength(17);
  expect(state.db.beds).toHaveLength(50);

  // Criterion 2, as the screen shows it.
  await open(page, INVENTORY);
  await expect(page.getByText("49 sellable beds.")).toBeVisible();
  await audit(page, "capacity");

  await open(page, `${INVENTORY}/rooms?q=q-3`);
  await expect(page.getByRole("link", { name: /Q-3/ })).toHaveCount(1);
  await expect(page.getByRole("link", { name: /D-1/ })).toHaveCount(0);
  await audit(page, "room list");
  await page.getByRole("link", { name: /Q-3/ }).click();
  await page.getByRole("button", { name: "Delete room" }).click();
  await dialog(page).getByRole("button", { name: "Delete room" }).click();
  await page.waitForURL("**/inventory/rooms");
  expect((await apiState()).db.rooms).toHaveLength(16);

  await open(page, `${INVENTORY}/room-types`);
  await page.getByRole("button", { name: "Delete Double" }).click();
  await dialog(page).getByRole("button", { name: "Delete room type" }).click();
  await expect(dialog(page).getByText("still has rooms")).toBeVisible();
  await cancelDialog(page);

  await open(page, `${INVENTORY}/rooms/not-a-uuid`);
  await expect(page.getByText(NOT_FOUND)).toBeVisible();
});

test("inventory follows permissions", async ({ page, context }) => {
  await signIn(context, "admin");
  await addPeriod(page);
  await open(page, `${INVENTORY}/room-types`);
  await addType(page, "Double", "2");
  await open(page, `${INVENTORY}/import`);
  await page.locator("#import-file").setInputFiles({ name: "rooms.csv", mimeType: "text/csv", buffer: Buffer.from(`${CSV_HEADER}\nDouble,D-1,,,2\n`) });
  await page.getByRole("button", { name: "Preview import" }).click();
  await page.getByRole("button", { name: /^Import 1 rooms/ }).click();
  await expect(page.getByText(/Added 1 rooms/)).toBeVisible();
  await open(page, `${INVENTORY}/prices`);
  await page.getByLabel("Price for Double (GH₵)").fill("4,500.00");
  await page.getByRole("button", { name: "Save price for Double" }).click();
  await expect(page.getByRole("button", { name: "Remove price for Double" })).toBeVisible();

  await signIn(context, "desk");
  await open(page, `${INVENTORY}/rooms`);
  await expect(page.getByRole("link", { name: /D-1/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add room" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Import CSV" })).toHaveCount(0);
  await open(page, `${INVENTORY}/prices`);
  await expect(page.getByText(/GH₵ 4,500\.00/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Save price/ })).toHaveCount(0);
  await audit(page, "read-only prices");
  await open(page, `${INVENTORY}/import`);
  await expect(page.getByText(NOT_FOUND)).toBeVisible();

  await signIn(context, "manager");
  await open(page, `${INVENTORY}/prices`);
  await expect(page.getByRole("button", { name: /Save price/ }), "no pricing.manage").toHaveCount(0);
  await open(page, `${INVENTORY}/room-types`);
  await expect(page.getByRole("button", { name: "Edit Double" })).toBeVisible();

  await signIn(context, "pricer");
  await open(page, INVENTORY);
  await page.waitForURL("**/inventory/prices");
  await expect(page.getByRole("button", { name: /Save price/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Rooms and beds" })).toHaveCount(0);
  await open(page, `${INVENTORY}/rooms`);
  await expect(page.getByText(NOT_FOUND)).toBeVisible();

  await signIn(context, "accounts");
  await open(page, INVENTORY);
  await expect(page.getByText(NOT_FOUND)).toBeVisible();
});
