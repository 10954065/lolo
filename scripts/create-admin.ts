/**
 * Bootstrap the first System Administrator (or a staff account) from the operator console.
 *
 *   npm run admin:create -- --email admin@example.org --name "Ama Mensah"
 *   npm run admin:create -- --email observer@example.org --name "Kojo Ofori" --role ELECTORAL_COMMITTEE
 *
 * A one-time temporary password is printed to THIS terminal only (never stored, logged or
 * emailed). It expires in 24 hours and must be changed at first sign-in.
 */
import { sql } from "drizzle-orm";
import { parseArgs } from "node:util";
import { z } from "zod";
import { loadEnv } from "./lib/load-env";

loadEnv();

const ROLES = ["SYSTEM_ADMIN", "ELECTORAL_COMMITTEE"] as const;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      role: { type: "string", default: "SYSTEM_ADMIN" },
    },
  });
  const parsed = z
    .object({
      email: z.string().trim().toLowerCase().pipe(z.email()),
      name: z.string().trim().min(2).max(120),
      role: z.enum(ROLES),
    })
    .safeParse(values);
  if (!parsed.success) {
    console.error('Usage: npm run admin:create -- --email <email> --name "<full name>" [--role SYSTEM_ADMIN|ELECTORAL_COMMITTEE]');
    process.exit(1);
  }
  const { email, name, role } = parsed.data;

  const [{ getDb, closeDb }, { users }, password, { recordAudit }, { SYSTEM_ACTOR }] = await Promise.all([
    import("@/server/db/client"),
    import("@/server/db/schema"),
    import("@/server/auth/password"),
    import("@/server/services/audit"),
    import("@/server/auth/actor"),
  ]);

  const db = getDb();
  try {
    const [existing] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
    if (existing) {
      console.error(`An account with ${email} already exists.`);
      process.exit(1);
    }
    const temporaryPassword = password.generateTemporaryPassword(16);
    const passwordHash = await password.hashPassword(temporaryPassword);
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({
          email,
          fullName: name,
          role,
          passwordHash,
          mustChangePassword: true,
          tempPasswordExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        })
        .returning({ id: users.id });
      await recordAudit(tx, { ...SYSTEM_ACTOR, label: "operator console" }, {
        action: "STAFF_ACCOUNT_BOOTSTRAPPED",
        resourceType: "user",
        resourceId: created.id,
        summary: `Created ${role === "SYSTEM_ADMIN" ? "System Administrator" : "Electoral Committee"} account for ${name} <${email}> from the operator console`,
      });
    });
    console.log("\nAccount created.");
    console.log(`  Email:              ${email}`);
    console.log(`  Role:               ${role}`);
    console.log(`  Temporary password: ${temporaryPassword}`);
    console.log("\nShare the temporary password privately. It expires in 24 hours and must be changed at first sign-in.\n");
  } finally {
    await closeDb();
  }
}

main().catch((error: unknown) => {
  console.error("Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
