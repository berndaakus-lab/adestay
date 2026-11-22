import { z } from "zod";

/** Custom hostel domains. Same hostname shape as the tenant_domains_hostname_format constraint. */
const HOSTNAME = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export const addDomainSchema = z.object({
  tenantId: z.uuid("Choose a hostel"),
  hostname: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => v.replace(/\.$/, ""))
    .refine((v) => v.length <= 253 && HOSTNAME.test(v), "Enter a domain like book.yourhostel.com.gh, without https://"),
});

export const domainIdSchema = z.object({ domainId: z.uuid("Choose a domain") });

export const manualDomainStatusSchema = z.object({
  domainId: z.uuid("Choose a domain"),
  status: z.enum(["pending", "verified", "failed"], "Choose a status"),
});

export const removeDomainSchema = z.object({
  domainId: z.uuid("Choose a domain"),
  reason: z.string().trim().min(3, "Give a short reason").max(500, "Reason is too long"),
});
