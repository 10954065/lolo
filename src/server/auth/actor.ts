import type { UserRole } from "@/server/db/schema/enums";

/** Who is performing an operation. Passed explicitly into every mutating service. */
export interface Actor {
  userId: string | null;
  role: UserRole | "SYSTEM";
  label: string;
  ipAddress?: string | null;
}

export const SYSTEM_ACTOR: Actor = { userId: null, role: "SYSTEM", label: "system" };

export function anonymousActor(ipAddress?: string | null): Actor {
  return { userId: null, role: "SYSTEM", label: "anonymous", ipAddress: ipAddress ?? null };
}
