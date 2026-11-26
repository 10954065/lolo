import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { elections } from "./elections";
import { emailStatus } from "./enums";
import { members } from "./members";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const emailJobs = pgTable(
  "email_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    template: text("template").notNull(),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    memberId: uuid("member_id").references(() => members.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    electionId: uuid("election_id").references(() => elections.id, { onDelete: "set null" }),
    /** Non-secret template variables. */
    payload: jsonb("payload").$type<Record<string, string>>().notNull().default({}),
    /** AES-256-GCM ciphertext of secret template variables; erased after delivery. */
    encryptedSecret: text("encrypted_secret"),
    status: emailStatus("status").notNull().default("QUEUED"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
    lastError: text("last_error"),
    providerMessageId: text("provider_message_id"),
    dedupeKey: text("dedupe_key").unique("email_jobs_dedupe_unique"),
    sentAt: ts("sent_at"),
    deliveredAt: ts("delivered_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("email_jobs_dispatch_idx").on(t.status, t.nextAttemptAt),
    index("email_jobs_member_idx").on(t.memberId),
    index("email_jobs_provider_idx").on(t.providerMessageId),
  ],
);

export const emailDeliveryLogs = pgTable(
  "email_delivery_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emailJobId: uuid("email_job_id")
      .notNull()
      .references(() => emailJobs.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    detail: text("detail"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("email_delivery_logs_job_idx").on(t.emailJobId)],
);

/**
 * Append-only, hash-chained audit log. UPDATE/DELETE/TRUNCATE are rejected by a trigger
 * (see drizzle custom migration). No foreign keys: entries must outlive anything they mention.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    occurredAt: ts("occurred_at").notNull(),
    actorUserId: uuid("actor_user_id"),
    actorRole: text("actor_role"),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    summary: text("summary").notNull(),
    reason: text("reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ipAddress: text("ip_address"),
    prevHash: text("prev_hash").notNull(),
    hash: text("hash").notNull().unique("audit_logs_hash_unique"),
  },
  (t) => [
    index("audit_logs_occurred_idx").on(t.occurredAt),
    index("audit_logs_action_idx").on(t.action),
    index("audit_logs_resource_idx").on(t.resourceType, t.resourceId),
    index("audit_logs_actor_idx").on(t.actorUserId),
  ],
);

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});
