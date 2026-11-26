"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireActiveAction, requirePermissionAction } from "@/server/auth/guards";
import { hasRecentReauthentication } from "@/server/auth/session";
import {
  changeStaffRole,
  createStaffAccount,
  resetStaffCredentials,
  revokeStaffSessions,
  setStaffStatus,
} from "@/server/services/accounts";
import { updateSettings } from "@/server/services/settings";
import { dispatchEmailsLater } from "./background";
import { formObject, formString, runAction } from "./run-action";

const refresh = () => revalidatePath("/admin/accounts");

export async function createStaffAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("createStaffAccount", async () => {
    const { actor, session } = await requirePermissionAction("accounts.manage");
    await createStaffAccount(actor, formObject(formData, ["fullName", "email", "role"]), hasRecentReauthentication(session));
    dispatchEmailsLater();
    refresh();
    return { ok: true, message: "Account created. Temporary login details were emailed to the new staff member." };
  });
}

export async function changeStaffRoleAction(userId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("changeStaffRole", async () => {
    const { actor, session } = await requirePermissionAction("accounts.manage");
    await changeStaffRole(actor, userId, formString(formData, "role"), formString(formData, "reason"), hasRecentReauthentication(session));
    refresh();
    return { ok: true, message: "Role changed. The account has been signed out everywhere." };
  });
}

export async function suspendStaffAction(userId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("suspendStaff", async () => {
    const { actor, session } = await requirePermissionAction("accounts.manage");
    await setStaffStatus(actor, userId, "SUSPENDED", formString(formData, "reason"), hasRecentReauthentication(session));
    refresh();
    return { ok: true, message: "Account suspended." };
  });
}

export async function reactivateStaffAction(userId: string): Promise<ActionState> {
  return runAction("reactivateStaff", async () => {
    const { actor, session } = await requirePermissionAction("accounts.manage");
    await setStaffStatus(actor, userId, "ACTIVE", null, hasRecentReauthentication(session));
    refresh();
    return { ok: true, message: "Account reactivated." };
  });
}

export async function resetStaffCredentialsAction(userId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("resetStaffCredentials", async () => {
    const { actor, session } = await requirePermissionAction("accounts.manage");
    await resetStaffCredentials(actor, userId, formString(formData, "reason"), hasRecentReauthentication(session));
    dispatchEmailsLater();
    refresh();
    return { ok: true, message: "New temporary credentials emailed. The account was signed out everywhere." };
  });
}

/** Any signed-in staff member may sign out their own other sessions; admins may revoke anyone's. */
export async function revokeSessionsAction(userId: string): Promise<ActionState> {
  return runAction("revokeSessions", async () => {
    const { actor, session } = await requireActiveAction();
    await revokeStaffSessions(actor, userId, session.sessionId);
    refresh();
    return { ok: true, message: userId === actor.userId ? "Signed out of all other devices." : "Account signed out of all devices." };
  });
}

export async function updateSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("updateSettings", async () => {
    const { actor } = await requirePermissionAction("settings.write");
    await updateSettings(
      actor,
      formObject(formData, [
        "organizationName",
        "supportEmail",
        "supportPhone",
        "tempPasswordValidityDays",
        "maxFailedLogins",
        "lockoutMinutes",
      ]),
    );
    revalidatePath("/admin/settings");
    return { ok: true, message: "Settings saved." };
  });
}
