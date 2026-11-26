import { z } from "zod";
import { emailField, optionalText, requiredText } from "./common";

export const GENDER_OPTIONS = ["Male", "Female", "Other", "Prefer not to say"] as const;

const PHONE_PATTERN = /^\+?[0-9 ()-]{7,20}$/;
const MEMBERSHIP_PATTERN = /^[A-Za-z0-9/._-]{1,40}$/;

export const memberInputSchema = z.object({
  fullName: requiredText("Full name", 2, 120),
  email: emailField,
  phone: optionalText(20).refine((v) => v === undefined || PHONE_PATTERN.test(v), {
    message: "Enter a valid phone number (digits, spaces, +, -, brackets).",
  }),
  membershipNumber: optionalText(40).refine((v) => v === undefined || MEMBERSHIP_PATTERN.test(v), {
    message: "Membership number may contain letters, numbers and / . _ - only.",
  }),
  gender: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.enum(GENDER_OPTIONS, { error: "Choose a valid option." }).optional(),
  ),
  notes: optionalText(1000),
});
export type MemberInput = z.infer<typeof memberInputSchema>;

export const memberListFiltersSchema = z.object({
  q: optionalText(100),
  approval: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional().catch(undefined),
  account: z.enum(["ACTIVE", "SUSPENDED", "DEACTIVATED"]).optional().catch(undefined),
  credential: z
    .enum(["NOT_ISSUED", "QUEUED", "SENT", "DELIVERED", "FAILED", "ACTIVATED"])
    .optional()
    .catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});
export type MemberListFilters = z.infer<typeof memberListFiltersSchema>;
