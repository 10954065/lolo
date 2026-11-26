import "server-only";
import { redirect } from "next/navigation";
import type { UserRole } from "@/server/db/schema/enums";
import { forbidden, unauthenticated } from "@/server/errors";
import type { Actor } from "./actor";
import { can, homePathForRole, type Permission } from "./permissions";
import { getRequestMeta } from "./request-context";
import { getCurrentSession, type ValidSession } from "./session";

export interface AuthContext {
  session: ValidSession;
  actor: Actor;
}

async function toContext(session: ValidSession): Promise<AuthContext> {
  const { ipAddress } = await getRequestMeta();
  return {
    session,
    actor: {
      userId: session.user.id,
      role: session.user.role,
      label: `${session.user.fullName} <${session.user.email}>`,
      ipAddress,
    },
  };
}

// ---- Page guards: redirect on failure -------------------------------------------------

/** Signed-in user, allowed even while a password change is pending (used by /change-password). */
export async function requireSessionPage(): Promise<AuthContext> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return toContext(session);
}

/** Signed-in user who has completed any forced password change. */
export async function requireActivePage(): Promise<AuthContext> {
  const ctx = await requireSessionPage();
  if (ctx.session.user.mustChangePassword) redirect("/change-password");
  return ctx;
}

export async function requireRolePage(...roles: UserRole[]): Promise<AuthContext> {
  const ctx = await requireActivePage();
  if (!roles.includes(ctx.session.user.role)) redirect(homePathForRole(ctx.session.user.role));
  return ctx;
}

export async function requirePermissionPage(permission: Permission): Promise<AuthContext> {
  const ctx = await requireActivePage();
  if (!can(ctx.actor, permission)) redirect(homePathForRole(ctx.session.user.role));
  return ctx;
}

// ---- Action / route-handler guards: throw on failure -----------------------------------

export async function requireSessionAction(): Promise<AuthContext> {
  const session = await getCurrentSession();
  if (!session) throw unauthenticated();
  return toContext(session);
}

export async function requireActiveAction(): Promise<AuthContext> {
  const ctx = await requireSessionAction();
  if (ctx.session.user.mustChangePassword) throw forbidden("Please change your temporary password first.");
  return ctx;
}

export async function requirePermissionAction(permission: Permission): Promise<AuthContext> {
  const ctx = await requireActiveAction();
  if (!can(ctx.actor, permission)) {
    throw forbidden(
      ctx.session.user.role === "ELECTORAL_COMMITTEE"
        ? "The Electoral Committee has read-only access and cannot perform this action."
        : undefined,
    );
  }
  return ctx;
}
