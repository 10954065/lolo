import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { userRole, userStatus } from "./enums";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    role: userRole("role").notNull(),
    status: userStatus("status").notNull().default("ACTIVE"),
    passwordHash: text("password_hash"),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    tempPasswordExpiresAt: ts("temp_password_expires_at"),
    passwordChangedAt: ts("password_changed_at"),
    failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
    lockedUntil: ts("locked_until"),
    lastLoginAt: ts("last_login_at"),
    createdBy: uuid("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
    index("users_role_idx").on(t.role),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 (hex) of the opaque session token held in the cookie. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    reauthenticatedAt: ts("reauthenticated_at"),
    userAgent: text("user_agent"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique("password_reset_tokens_hash_unique"),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("password_reset_tokens_user_idx").on(t.userId)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: ts("window_start").notNull(),
  count: integer("count").notNull().default(0),
});
