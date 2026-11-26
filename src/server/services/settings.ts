import "server-only";
import { z } from "zod";
import { assertCan } from "@/server/auth/permissions";
import type { Actor } from "@/server/auth/actor";
import { getDb, type Executor } from "@/server/db/client";
import { systemSettings } from "@/server/db/schema";
import { validationError } from "@/server/errors";
import { recordAudit } from "./audit";

export const settingsSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  supportEmail: z.union([z.literal(""), z.email().max(200)]),
  supportPhone: z.string().trim().max(40),
  tempPasswordValidityDays: z.coerce.number().int().min(1).max(30),
  maxFailedLogins: z.coerce.number().int().min(3).max(20),
  lockoutMinutes: z.coerce.number().int().min(1).max(24 * 60),
});
export type SystemSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: SystemSettings = {
  organizationName: "MOBA 2017",
  supportEmail: "",
  supportPhone: "",
  tempPasswordValidityDays: 7,
  maxFailedLogins: 5,
  lockoutMinutes: 15,
};

export async function getSettings(executor: Executor = getDb()): Promise<SystemSettings> {
  const rows = await executor.select().from(systemSettings);
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  const parsed = settingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function updateSettings(actor: Actor, input: unknown): Promise<SystemSettings> {
  assertCan(actor, "settings.write");
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    throw validationError("Please correct the highlighted settings.", z.flattenError(parsed.error).fieldErrors);
  }
  const before = await getSettings();
  const changed = (Object.keys(parsed.data) as Array<keyof SystemSettings>).filter(
    (k) => parsed.data[k] !== before[k],
  );
  await getDb().transaction(async (tx) => {
    for (const key of changed) {
      await tx
        .insert(systemSettings)
        .values({ key, value: parsed.data[key], updatedBy: actor.userId, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: parsed.data[key], updatedBy: actor.userId, updatedAt: new Date() },
        });
    }
    if (changed.length > 0) {
      await recordAudit(tx, actor, {
        action: "SETTINGS_UPDATED",
        resourceType: "system_settings",
        summary: `Updated settings: ${changed.join(", ")}`,
        metadata: { changed: Object.fromEntries(changed.map((k) => [k, { from: before[k], to: parsed.data[k] }])) },
      });
    }
  });
  return parsed.data;
}
