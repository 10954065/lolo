import type { UserRole } from "@/server/db/schema/enums";
import { forbidden } from "@/server/errors";
import type { Actor } from "./actor";

/**
 * Single source of truth for authorization. There is deliberately NO permission that
 * allows reading an individual ballot — that capability does not exist.
 */
export const PERMISSIONS = [
  "dashboard.staff",
  "members.read",
  "members.write",
  "credentials.send",
  "elections.read",
  "elections.write",
  "elections.transition",
  "positions.write",
  "candidates.write",
  "voters.write",
  "announcements.write",
  "results.read.unpublished",
  "results.read.published",
  "results.publish",
  "participation.read",
  "audit.read",
  "emails.read",
  "emails.write",
  "reports.export",
  "accounts.read",
  "accounts.manage",
  "settings.read",
  "settings.write",
  "ballot.cast",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const READ_ONLY_STAFF: readonly Permission[] = [
  "dashboard.staff",
  "members.read",
  "elections.read",
  "results.read.published",
  "participation.read",
  "audit.read",
  "emails.read",
  "reports.export",
  "accounts.read",
  "settings.read",
];

const ROLE_PERMISSIONS: Readonly<Record<UserRole, ReadonlySet<Permission>>> = {
  SYSTEM_ADMIN: new Set<Permission>(PERMISSIONS.filter((p) => p !== "ballot.cast")),
  ELECTORAL_COMMITTEE: new Set<Permission>(READ_ONLY_STAFF),
  VOTER: new Set<Permission>(["ballot.cast"]),
};

export function roleHasPermission(role: UserRole | "SYSTEM", permission: Permission): boolean {
  if (role === "SYSTEM") return false;
  return ROLE_PERMISSIONS[role].has(permission);
}

export function can(actor: Pick<Actor, "role">, permission: Permission): boolean {
  return roleHasPermission(actor.role, permission);
}

/**
 * Throw FORBIDDEN unless the actor holds the permission. Called at the top of every
 * mutating service function, independently of any page or action check.
 */
export function assertCan(actor: Pick<Actor, "role">, permission: Permission): void {
  if (!can(actor, permission)) {
    throw forbidden(
      actor.role === "ELECTORAL_COMMITTEE"
        ? "The Electoral Committee has read-only access and cannot perform this action."
        : undefined,
    );
  }
}

/** Home route for each role after sign-in. */
export function homePathForRole(role: UserRole): "/admin" | "/committee" | "/dashboard" {
  if (role === "SYSTEM_ADMIN") return "/admin";
  if (role === "ELECTORAL_COMMITTEE") return "/committee";
  return "/dashboard";
}
