import { Client } from "pg";
import type { Actor } from "@/server/auth/actor";
import { hashPassword } from "@/server/auth/password";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import type { UserRole } from "@/server/db/schema/enums";
import type { EmailTransport, OutgoingEmail } from "@/server/email/transport";

const TABLES = [
  "ballot_selections",
  "ballots",
  "voter_participation",
  "tie_resolutions",
  "election_results",
  "announcements",
  "candidate_photos",
  "candidates",
  "executive_positions",
  "election_voters",
  "election_status_history",
  "election_state_log",
  "elections",
  "email_delivery_logs",
  "email_jobs",
  "password_reset_tokens",
  "sessions",
  "members",
  "member_imports",
  "audit_logs",
  "rate_limits",
  "system_settings",
  "users",
];

/** Wipe all data (owner connection; replica mode bypasses the append-only triggers). */
export async function resetDatabase(): Promise<void> {
  const owner = new Client({ connectionString: process.env.TEST_DATABASE_OWNER_URL });
  await owner.connect();
  try {
    await owner.query("SET session_replication_role = replica");
    await owner.query(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
  } finally {
    await owner.end();
  }
}

/** Run SQL as the owner (for tests that need to inspect the anonymous ballot tables). */
export async function asOwner<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const owner = new Client({ connectionString: process.env.TEST_DATABASE_OWNER_URL });
  await owner.connect();
  try {
    return await fn(owner);
  } finally {
    await owner.end();
  }
}

export interface TestStaff {
  id: string;
  email: string;
  password: string;
  actor: Actor;
}

let counter = 0;

export async function createStaff(role: Exclude<UserRole, "VOTER">, overrides: { password?: string } = {}): Promise<TestStaff> {
  counter += 1;
  const email = `${role.toLowerCase()}${counter}@moba-test.org`;
  const password = overrides.password ?? `Staff-Pass-${counter}-xyz`;
  const [user] = await getDb()
    .insert(users)
    .values({
      email,
      fullName: `${role === "SYSTEM_ADMIN" ? "Admin" : "Committee"} Person ${counter}`,
      role,
      passwordHash: await hashPassword(password),
      mustChangePassword: false,
    })
    .returning({ id: users.id });
  return {
    id: user.id,
    email,
    password,
    actor: { userId: user.id, role, label: `${role} ${counter} <${email}>`, ipAddress: "127.0.0.1" },
  };
}

/** In-memory transport capturing every sent email; can be told to fail. */
export class MemoryTransport implements EmailTransport {
  readonly name = "memory";
  readonly sent: OutgoingEmail[] = [];
  shouldFail = false;

  async send(message: OutgoingEmail, options: { idempotencyKey: string }) {
    if (this.shouldFail) throw new Error("Simulated provider outage");
    this.sent.push(message);
    return { providerMessageId: `mem-${options.idempotencyKey}` };
  }

  lastTo(email: string): OutgoingEmail | undefined {
    return [...this.sent].reverse().find((m) => m.to === email.toLowerCase());
  }

  clear(): void {
    this.sent.length = 0;
  }
}

export function extractTemporaryPassword(email: OutgoingEmail): string {
  const match = /Temporary password:\s*\n\s*\n([A-Za-z0-9]{12})/.exec(email.text);
  if (!match) throw new Error("No temporary password found in email");
  return match[1];
}

export function extractResetToken(email: OutgoingEmail): string {
  const match = /reset-password\?token=([A-Za-z0-9_%-]+)/.exec(email.text);
  if (!match) throw new Error("No reset link found in email");
  return decodeURIComponent(match[1]);
}

export const testMeta = { ipAddress: "203.0.113.10", userAgent: "vitest" };
