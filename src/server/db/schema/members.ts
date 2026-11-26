import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { accountStatus, approvalStatus, credentialStatus, importStatus } from "./enums";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export interface ImportRowResult {
  rowNumber: number;
  input: Record<string, string>;
  status: "valid" | "invalid" | "duplicate";
  errors: string[];
  normalized?: {
    fullName: string;
    email: string;
    phone: string | null;
    membershipNumber: string | null;
    gender: string | null;
  };
}

export interface ImportSummary {
  created: number;
  skipped: number;
  failed: Array<{ rowNumber: number; email: string; reason: string }>;
}

export const memberImports = pgTable("member_imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  fileName: text("file_name").notNull(),
  status: importStatus("status").notNull().default("PREVIEW"),
  totalRows: integer("total_rows").notNull().default(0),
  validRows: integer("valid_rows").notNull().default(0),
  invalidRows: integer("invalid_rows").notNull().default(0),
  duplicateRows: integer("duplicate_rows").notNull().default(0),
  rows: jsonb("rows").$type<ImportRowResult[]>().notNull().default([]),
  summary: jsonb("summary").$type<ImportSummary>(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: ts("created_at").notNull().defaultNow(),
  committedAt: ts("committed_at"),
});

export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .unique("members_user_unique")
      .references(() => users.id, { onDelete: "set null" }),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    membershipNumber: text("membership_number"),
    gender: text("gender"),
    approvalStatus: approvalStatus("approval_status").notNull().default("PENDING"),
    accountStatus: accountStatus("account_status").notNull().default("ACTIVE"),
    credentialStatus: credentialStatus("credential_status").notNull().default("NOT_ISSUED"),
    credentialIssuedAt: ts("credential_issued_at"),
    registeredAt: ts("registered_at").notNull().defaultNow(),
    approvedAt: ts("approved_at"),
    approvedBy: uuid("approved_by").references(() => users.id),
    rejectionReason: text("rejection_reason"),
    importId: uuid("import_id").references(() => memberImports.id, { onDelete: "set null" }),
    notes: text("notes"),
    deletedAt: ts("deleted_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("members_email_unique").on(sql`lower(${t.email})`),
    uniqueIndex("members_membership_number_unique")
      .on(sql`lower(${t.membershipNumber})`)
      .where(sql`${t.membershipNumber} is not null`),
    index("members_approval_idx").on(t.approvalStatus),
    index("members_account_idx").on(t.accountStatus),
    index("members_name_idx").on(t.fullName),
  ],
);
