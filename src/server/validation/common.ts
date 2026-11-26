import { z } from "zod";

/** Form fields arrive as strings; treat blank as "not provided". */
export const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max, `Must be at most ${max} characters.`).optional(),
  );

export const requiredText = (label: string, min: number, max: number) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(min, `${label} must be at least ${min} characters.`)
    .max(max, `${label} must be at most ${max} characters.`);

export const emailField = z
  .string({ error: "Email is required." })
  .trim()
  .toLowerCase()
  .max(200, "Email is too long.")
  .pipe(z.email("Enter a valid email address."));

export const uuidField = z.uuid("Invalid identifier.");

export const reasonField = (min = 10) =>
  z
    .string({ error: "A reason is required." })
    .trim()
    .min(min, `Please give a reason of at least ${min} characters.`)
    .max(2000, "Reason is too long.");

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Escape LIKE wildcards in user-supplied search text. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Flatten a ZodError into a field → messages map for forms. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
