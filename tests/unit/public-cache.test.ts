import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ updateTag: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ updateTag: h.updateTag }));

import { publicCacheEnabled, publicSiteTag, refreshPublicSite } from "@/lib/server/tenant/public-cache";

afterEach(() => vi.unstubAllEnvs());

describe("public site cache", () => {
  it("keeps each hostel's cache separate", () => {
    expect(publicSiteTag("tenant-a")).not.toBe(publicSiteTag("tenant-b"));
  });
  it("clears only the changed hostel", () => {
    refreshPublicSite("tenant-a");
    expect(h.updateTag).toHaveBeenCalledExactlyOnceWith(publicSiteTag("tenant-a"));
  });
  it("is on unless explicitly turned off", () => {
    expect(publicCacheEnabled()).toBe(true);
    vi.stubEnv("ADESTAY_PUBLIC_CACHE", "off");
    expect(publicCacheEnabled()).toBe(false);
  });
});
