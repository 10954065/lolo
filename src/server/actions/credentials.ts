"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requirePermissionAction } from "@/server/auth/guards";
import { hasRecentReauthentication } from "@/server/auth/session";
import { issueCredentials, regenerateCredentials } from "@/server/services/credentials";
import { dispatchDueEmails, retryEmailJob } from "@/server/services/email-queue";
import { dispatchEmailsLater } from "./background";
import { formString, runAction } from "./run-action";

function revalidateCredentialViews(memberId?: string): void {
  revalidatePath("/admin/credentials");
  revalidatePath("/admin/members");
  revalidatePath("/admin/emails");
  revalidatePath("/admin");
  if (memberId) revalidatePath(`/admin/members/${memberId}`);
}

export async function issueCredentialsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("issueCredentials", async () => {
    const { actor } = await requirePermissionAction("credentials.send");
    const ids = formData.getAll("memberId").filter((v): v is string => typeof v === "string");
    const target = formString(formData, "scope") === "all" ? "ALL_ELIGIBLE" : ids;
    const result = await issueCredentials(actor, target);
    dispatchEmailsLater();
    revalidateCredentialViews(ids.length === 1 ? ids[0] : undefined);
    const skipped = result.skipped.length;
    if (result.issued === 0 && skipped === 0) {
      return { ok: true, message: "There are no approved members waiting for credentials." };
    }
    const skippedText = skipped
      ? ` ${skipped} skipped: ${result.skipped
          .slice(0, 3)
          .map((s) => `${s.name} (${s.reason})`)
          .join("; ")}${skipped > 3 ? "…" : ""}`
      : "";
    return {
      ok: result.issued > 0,
      message: `${result.issued} credential email${result.issued === 1 ? "" : "s"} queued for delivery.${skippedText}`,
    };
  });
}

export async function regenerateCredentialsAction(
  memberId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction("regenerateCredentials", async () => {
    const { actor, session } = await requirePermissionAction("credentials.send");
    await regenerateCredentials(actor, memberId, formString(formData, "reason"), hasRecentReauthentication(session));
    dispatchEmailsLater();
    revalidateCredentialViews(memberId);
    return {
      ok: true,
      message: "New credentials generated and queued for delivery. The previous password no longer works.",
    };
  });
}

export async function retryEmailAction(jobId: string): Promise<ActionState> {
  return runAction("retryEmail", async () => {
    const { actor } = await requirePermissionAction("emails.write");
    await retryEmailJob(actor, jobId);
    dispatchEmailsLater();
    revalidateCredentialViews();
    return { ok: true, message: "Email re-queued for delivery (same content, no new password generated)." };
  });
}

export async function dispatchNowAction(): Promise<ActionState> {
  return runAction("dispatchNow", async () => {
    await requirePermissionAction("emails.write");
    const result = await dispatchDueEmails();
    revalidateCredentialViews();
    return {
      ok: true,
      message: `Sent ${result.sent}. ${result.retried} scheduled for retry. ${result.failed} failed permanently.`,
    };
  });
}
