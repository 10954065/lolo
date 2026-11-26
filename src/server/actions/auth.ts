"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { requireSessionAction } from "@/server/auth/guards";
import { homePathForRole } from "@/server/auth/permissions";
import { getRequestMeta } from "@/server/auth/request-context";
import { deleteSessionCookie, getCurrentSession, setSessionCookie } from "@/server/auth/session";
import { validationError } from "@/server/errors";
import { logger } from "@/server/logger";
import {
  changePassword,
  confirmPassword,
  login,
  logout,
  requestPasswordReset,
  resetPassword,
} from "@/server/services/auth";
import { dispatchEmailsLater } from "./background";
import { formString, runAction } from "./run-action";

/** Only same-site relative paths inside the user's own area are honoured as post-login targets. */
function safeNextPath(next: string, home: string): string | null {
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  return next === home || next.startsWith(`${home}/`) ? next : null;
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let destination = "/";
  const result = await runAction("login", async () => {
    const email = formString(formData, "email");
    const password = formString(formData, "password");
    if (!email || !password) throw validationError("Enter your email and password.");
    const meta = await getRequestMeta();
    const outcome = await login(email, password, meta);
    await setSessionCookie(outcome.token, outcome.expiresAt);
    const session = await getCurrentSession();
    const home = session ? homePathForRole(session.user.role) : outcome.redirectTo;
    destination =
      outcome.redirectTo === "/change-password"
        ? outcome.redirectTo
        : (safeNextPath(formString(formData, "next"), home) ?? outcome.redirectTo);
  });
  if (result && !result.ok) return result;
  redirect(destination);
}

export async function logoutAction(): Promise<void> {
  const session = await getCurrentSession();
  if (session) {
    const meta = await getRequestMeta();
    await logout(session, {
      userId: session.user.id,
      role: session.user.role,
      label: `${session.user.fullName} <${session.user.email}>`,
      ipAddress: meta.ipAddress,
    }).catch((error: unknown) => logger.error("logout failed", error));
  }
  await deleteSessionCookie();
  redirect("/login?signedOut=1");
}

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let destination = "/";
  const result = await runAction("changePassword", async () => {
    const { session, actor } = await requireSessionAction();
    const meta = await getRequestMeta();
    const outcome = await changePassword(
      session,
      actor,
      {
        currentPassword: formString(formData, "currentPassword"),
        newPassword: formString(formData, "newPassword"),
        confirmPassword: formString(formData, "confirmPassword"),
      },
      meta.userAgent,
    );
    await setSessionCookie(outcome.token, outcome.expiresAt);
    dispatchEmailsLater();
    destination = outcome.redirectTo;
  });
  if (result && !result.ok) return result;
  redirect(`${destination}?passwordChanged=1`);
}

export async function forgotPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("forgotPassword", async () => {
    const email = formString(formData, "email");
    if (!email.includes("@")) throw validationError("Enter the email address you use to sign in.", { email: ["Enter a valid email address."] });
    await requestPasswordReset(email, await getRequestMeta());
    dispatchEmailsLater();
    return {
      ok: true,
      message:
        "If an active account uses that email address, a password reset link has been sent. The link expires in 30 minutes. Check your spam folder if it does not arrive.",
    };
  });
}

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = await runAction("resetPassword", async () => {
    await resetPassword(
      formString(formData, "token"),
      formString(formData, "newPassword"),
      formString(formData, "confirmPassword"),
      await getRequestMeta(),
    );
    dispatchEmailsLater();
  });
  if (result && !result.ok) return result;
  redirect("/login?reset=1");
}

/** Step-up: re-enter password before a sensitive action (valid for 10 minutes). */
export async function confirmPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("confirmPassword", async () => {
    const { session, actor } = await requireSessionAction();
    await confirmPassword(session, actor, formString(formData, "password"));
    return { ok: true, message: "Password confirmed. You can continue." };
  });
}
