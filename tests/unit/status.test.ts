import { describe, expect, it } from "vitest";
import {
  bedAllocationStatus,
  bookingRequestStatus,
  invoiceStatus,
  paymentStatus,
  reservationStatus,
  tenantStatus,
} from "@/lib/status";

const maps = { bookingRequestStatus, reservationStatus, bedAllocationStatus, invoiceStatus, paymentStatus, tenantStatus };

describe("status maps", () => {
  it.each(Object.entries(maps))("%s has a non-empty label and a known tone for every state", (_, map) => {
    for (const style of Object.values(map)) {
      expect(style.label.trim()).not.toBe("");
      expect(["neutral", "info", "warning", "success", "danger"]).toContain(style.tone);
    }
  });

  it("never shows a pending payment as paid", () => {
    expect(paymentStatus.pending.tone).not.toBe("success");
    expect(paymentStatus.initiated.tone).not.toBe("success");
  });

  it("uses distinct labels within each map", () => {
    for (const map of Object.values(maps)) {
      const labels = Object.values(map).map((s) => s.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});
