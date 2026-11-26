import { z } from "zod";
import { zonedInputToUtc } from "@/lib/datetime";
import { RESULTS_VISIBILITIES } from "@/server/db/schema/enums";
import { optionalText, requiredText } from "./common";

const MIN_VOTING_MINUTES = 15;

export const zonedDateTime = (label: string) =>
  z
    .string({ error: `${label} is required.` })
    .transform((value, ctx) => {
      const date = zonedInputToUtc(value);
      if (!date) {
        ctx.addIssue({ code: "custom", message: `${label} must be a valid date and time.` });
        return z.NEVER;
      }
      return date;
    });

export const electionInputSchema = z
  .object({
    title: requiredText("Title", 5, 150),
    description: optionalText(5000),
    electionYear: z.coerce
      .number({ error: "Election year is required." })
      .int()
      .min(2017, "Election year must be 2017 or later.")
      .max(2100),
    opensAt: zonedDateTime("Opening time"),
    closesAt: zonedDateTime("Closing time"),
    rules: optionalText(10000),
    instructions: optionalText(10000),
    resultsVisibility: z.enum(RESULTS_VISIBILITIES, { error: "Choose who can see published results." }),
    tieBreakProcedure: requiredText("Tie-break procedure", 10, 2000),
  })
  .superRefine((v, ctx) => {
    if (v.closesAt.getTime() - v.opensAt.getTime() < MIN_VOTING_MINUTES * 60_000) {
      ctx.addIssue({
        code: "custom",
        path: ["closesAt"],
        message: `Voting must stay open for at least ${MIN_VOTING_MINUTES} minutes after the opening time.`,
      });
    }
  });
export type ElectionInput = z.infer<typeof electionInputSchema>;

export const positionInputSchema = z.object({
  title: requiredText("Position title", 2, 100),
  description: optionalText(1000),
  maxSelections: z.coerce.number().int().min(1, "At least 1 seat.").max(10, "At most 10 seats."),
  allowAbstain: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  maxCandidates: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(1).max(50).optional(),
  ),
});
export type PositionInput = z.infer<typeof positionInputSchema>;

export const candidateInputSchema = z.object({
  positionId: z.uuid("Choose a position."),
  fullName: requiredText("Full name", 2, 120),
  membershipNumber: optionalText(40),
  memberEmail: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().toLowerCase().pipe(z.email("Enter a valid email.")).optional(),
  ),
  biography: optionalText(3000),
  manifesto: optionalText(10000),
});
export type CandidateInput = z.infer<typeof candidateInputSchema>;

export const announcementInputSchema = z.object({
  title: requiredText("Title", 3, 150),
  body: requiredText("Message", 5, 5000),
});
