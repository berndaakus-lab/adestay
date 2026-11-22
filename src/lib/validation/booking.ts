import { z } from "zod";
import { normalizePhone } from "@/lib/phone";

const NO_CONTROL_CHARACTERS = /^[^\u0000-\u001f\u007f]*$/;

const optionalLine = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long`)
    .regex(NO_CONTROL_CHARACTERS, `${label} contains characters that are not allowed`)
    .optional()
    .transform((value) => value || null);

/** The student's booking form. The hostel is never part of it: the server takes it from the site. */
export const bookingRequestSchema = z.object({
  periodId: z.uuid("Choose a period"),
  roomTypeId: z.uuid("Choose a room type"),
  idempotencyKey: z.uuid("Refresh the page and try again"),
  fullName: z
    .string("Enter your full name")
    .trim()
    .min(2, "Enter your full name")
    .max(120, "Your name is too long")
    .regex(NO_CONTROL_CHARACTERS, "Your name contains characters that are not allowed"),
  phone: z.string("Enter your phone number").transform((value, ctx) => {
    const phone = normalizePhone(value);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "Enter a valid phone number, e.g. 024 123 4567" });
      return z.NEVER;
    }
    return phone;
  }),
  institution: optionalLine(120, "Institution"),
  programme: optionalLine(120, "Programme"),
  level: optionalLine(40, "Level"),
  studentId: optionalLine(40, "Student ID"),
  gender: z
    .union([z.enum(["female", "male", "undisclosed"], "Choose an option"), z.literal("")])
    .optional()
    .transform((value) => value || null),
  note: z
    .string()
    .trim()
    .max(1000, "Your note can be up to 1000 characters")
    .optional()
    .transform((value) => value || null),
});

export type BookingRequestInput = z.output<typeof bookingRequestSchema>;
