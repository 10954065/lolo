"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requirePermissionAction } from "@/server/auth/guards";
import { hasRecentReauthentication } from "@/server/auth/session";
import { publishResults, recordTieResolution, unpublishResults } from "@/server/services/results";
import { dispatchEmailsLater } from "./background";
import { formString, runAction } from "./run-action";

function refresh(electionId: string): void {
  revalidatePath(`/admin/elections/${electionId}`, "layout");
  revalidatePath(`/dashboard/results/${electionId}`);
  revalidatePath("/dashboard");
}

export async function publishResultsAction(electionId: string): Promise<ActionState> {
  return runAction("publishResults", async () => {
    const { actor, session } = await requirePermissionAction("results.publish");
    await publishResults(actor, electionId, hasRecentReauthentication(session));
    dispatchEmailsLater();
    refresh(electionId);
    return { ok: true, message: "Results published. Members are being notified." };
  });
}

export async function unpublishResultsAction(electionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("unpublishResults", async () => {
    const { actor, session } = await requirePermissionAction("results.publish");
    await unpublishResults(actor, electionId, formString(formData, "reason"), hasRecentReauthentication(session));
    refresh(electionId);
    return { ok: true, message: "Publication withdrawn." };
  });
}

export async function recordTieResolutionAction(electionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("recordTieResolution", async () => {
    const { actor, session } = await requirePermissionAction("results.publish");
    const [positionId = "", winnerCandidateId = ""] = formString(formData, "tieChoice").split(":");
    await recordTieResolution(
      actor,
      electionId,
      {
        positionId,
        winnerCandidateId,
        method: formString(formData, "method"),
        notes: formString(formData, "notes"),
      },
      hasRecentReauthentication(session),
    );
    refresh(electionId);
    return { ok: true, message: "Tie-break outcome recorded. Vote counts are unchanged." };
  });
}
