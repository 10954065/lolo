"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { formatDateTime } from "@/lib/datetime";
import { requirePermissionAction } from "@/server/auth/guards";
import { getRequestMeta } from "@/server/auth/request-context";
import { forbidden, validationError } from "@/server/errors";
import { castBallot, selectionsFromFormData, verifyReceipt } from "@/server/services/voting";
import { dispatchEmailsLater } from "./background";
import { formString, runAction } from "./run-action";

/**
 * Submit a ballot. The receipt is returned in the response body only — never placed in a URL
 * (URLs end up in browser history and server logs) and never stored with the voter.
 */
export async function castBallotAction(electionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("castBallot", async () => {
    const { session, actor } = await requirePermissionAction("ballot.cast");
    if (!session.user.memberId) throw forbidden("Only members can vote.");
    const result = await castBallot(actor, session.user.memberId, electionId, selectionsFromFormData(formData));
    dispatchEmailsLater();
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/elections/${electionId}`);
    return {
      ok: true,
      message: "Your ballot has been recorded.",
      data: { receipt: result.receipt, votedAt: formatDateTime(result.votedAt), electionTitle: result.electionTitle },
    };
  });
}

/** Public: confirm that a receipt belongs to a stored ballot (inclusion only — never content). */
export async function verifyReceiptAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("verifyReceipt", async () => {
    const receipt = formString(formData, "receipt").trim();
    if (receipt.length < 10 || receipt.length > 60) {
      throw validationError("Enter the receipt code exactly as shown after voting.", { receipt: ["Invalid receipt code."] });
    }
    const { ipAddress } = await getRequestMeta();
    const result = await verifyReceipt(receipt, ipAddress);
    return result.isFound
      ? { ok: true, message: `This receipt matches a ballot recorded in “${result.electionTitle}”. It is included in the count.` }
      : { ok: false, message: "No ballot matches this receipt. Check that you typed it exactly as shown." };
  });
}
