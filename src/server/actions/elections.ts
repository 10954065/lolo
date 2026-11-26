"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { requirePermissionAction } from "@/server/auth/guards";
import { hasRecentReauthentication } from "@/server/auth/session";
import { ELECTION_STATUSES, type ElectionStatus } from "@/server/db/schema/enums";
import { validationError } from "@/server/errors";
import { createAnnouncement, deleteAnnouncement } from "@/server/services/announcements";
import {
  createCandidate,
  decideCandidate,
  deactivateCandidate,
  removeCandidatePhoto,
  updateCandidate,
  withdrawCandidate,
} from "@/server/services/candidates";
import {
  cancelElection,
  createElection,
  deleteDraftElection,
  extendVoting,
  postponeElection,
  sendVotingReminder,
  transitionElection,
  updateElection,
} from "@/server/services/elections";
import { MAX_PHOTO_BYTES } from "@/server/services/photos";
import {
  addStandardPositions,
  createPosition,
  deletePosition,
  movePosition,
  updatePosition,
} from "@/server/services/positions";
import { addAllEligibleToRoll, addMembersToRoll, removeFromRoll } from "@/server/services/voter-roll";
import { dispatchEmailsLater } from "./background";
import { formBool, formObject, formString, runAction } from "./run-action";

const ELECTION_FIELDS = [
  "title",
  "description",
  "electionYear",
  "opensAt",
  "closesAt",
  "rules",
  "instructions",
  "resultsVisibility",
  "tieBreakProcedure",
] as const;
const POSITION_FIELDS = ["title", "description", "maxSelections", "allowAbstain", "maxCandidates"] as const;
const CANDIDATE_FIELDS = ["positionId", "fullName", "membershipNumber", "memberEmail", "biography", "manifesto"] as const;

function refresh(electionId: string): void {
  revalidatePath(`/admin/elections/${electionId}`, "layout");
  revalidatePath("/admin/elections");
  revalidatePath("/admin");
}

async function photoFrom(formData: FormData): Promise<Buffer | null> {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_PHOTO_BYTES) throw validationError("The photo must be 5 MB or smaller.", { photo: ["Too large (max 5 MB)."] });
  return Buffer.from(await file.arrayBuffer());
}

// ---- Elections ---------------------------------------------------------------------------

export async function createElectionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let id = "";
  const result = await runAction("createElection", async () => {
    const { actor } = await requirePermissionAction("elections.write");
    id = await createElection(actor, formObject(formData, ELECTION_FIELDS));
    revalidatePath("/admin/elections");
  });
  if (result && !result.ok) return result;
  redirect(`/admin/elections/${id}?created=1`);
}

export async function updateElectionAction(electionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("updateElection", async () => {
    const { actor } = await requirePermissionAction("elections.write");
    await updateElection(actor, electionId, formObject(formData, ELECTION_FIELDS));
    refresh(electionId);
    return { ok: true, message: "Election details saved." };
  });
}

export async function deleteDraftElectionAction(electionId: string): Promise<ActionState> {
  const result = await runAction("deleteDraftElection", async () => {
    const { actor } = await requirePermissionAction("elections.write");
    await deleteDraftElection(actor, electionId);
    revalidatePath("/admin/elections");
  });
  if (result && !result.ok) return result;
  redirect("/admin/elections?deleted=1");
}

export async function transitionElectionAction(electionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("transitionElection", async () => {
    const { actor } = await requirePermissionAction("elections.transition");
    const to = formString(formData, "to") as ElectionStatus;
    if (!ELECTION_STATUSES.includes(to)) throw validationError("Unknown status.");
    await transitionElection(actor, electionId, to);
    dispatchEmailsLater();
    refresh(electionId);
    return { ok: true, message: "Election status updated." };
  });
}

export async function postponeElectionAction(electionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("postponeElection", async () => {
    const { actor, session } = await requirePermissionAction("elections.transition");
    await postponeElection(
      actor,
      electionId,
      { opensAt: formString(formData, "opensAt"), closesAt: formString(formData, "closesAt"), reason: formString(formData, "reason") },
      hasRecentReauthentication(session),
    );
    dispatchEmailsLater();
    refresh(electionId);
    return { ok: true, message: "Election postponed. Voters on the roll are being notified." };
  });
}

export async function extendVotingAction(electionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("extendVoting", async () => {
    const { actor, session } = await requirePermissionAction("elections.transition");
    await extendVoting(
      actor,
      electionId,
      { closesAt: formString(formData, "closesAt"), reason: formString(formData, "reason") },
      hasRecentReauthentication(session),
    );
    dispatchEmailsLater();
    refresh(electionId);
    return { ok: true, message: "Voting extended. Members who have not voted are being notified." };
  });
}

export async function cancelElectionAction(electionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("cancelElection", async () => {
    const { actor, session } = await requirePermissionAction("elections.transition");
    await cancelElection(actor, electionId, formString(formData, "reason"), hasRecentReauthentication(session));
    dispatchEmailsLater();
    refresh(electionId);
    return { ok: true, message: "Election cancelled." };
  });
}

export async function sendReminderAction(electionId: string): Promise<ActionState> {
  return runAction("sendReminder", async () => {
    const { actor } = await requirePermissionAction("elections.transition");
    const sent = await sendVotingReminder(actor, electionId);
    dispatchEmailsLater();
    return { ok: true, message: `Reminder queued for ${sent} member${sent === 1 ? "" : "s"} who have not voted.` };
  });
}

// ---- Positions ---------------------------------------------------------------------------

export async function createPositionAction(electionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("createPosition", async () => {
    const { actor } = await requirePermissionAction("positions.write");
    await createPosition(actor, electionId, formObject(formData, POSITION_FIELDS));
    refresh(electionId);
    return { ok: true, message: "Position added." };
  });
}

export async function addStandardPositionsAction(electionId: string): Promise<ActionState> {
  return runAction("addStandardPositions", async () => {
    const { actor } = await requirePermissionAction("positions.write");
    const added = await addStandardPositions(actor, electionId);
    refresh(electionId);
    return { ok: true, message: added ? `${added} standard positions added.` : "All standard positions already exist." };
  });
}

export async function updatePositionAction(electionId: string, positionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("updatePosition", async () => {
    const { actor } = await requirePermissionAction("positions.write");
    await updatePosition(actor, positionId, formObject(formData, POSITION_FIELDS));
    refresh(electionId);
    return { ok: true, message: "Position saved." };
  });
}

export async function deletePositionAction(electionId: string, positionId: string): Promise<ActionState> {
  return runAction("deletePosition", async () => {
    const { actor } = await requirePermissionAction("positions.write");
    await deletePosition(actor, positionId);
    refresh(electionId);
    return { ok: true, message: "Position deleted." };
  });
}

export async function movePositionAction(electionId: string, positionId: string, direction: "up" | "down"): Promise<ActionState> {
  return runAction("movePosition", async () => {
    const { actor } = await requirePermissionAction("positions.write");
    await movePosition(actor, positionId, direction === "up" ? "up" : "down");
    refresh(electionId);
    return { ok: true, message: "Order updated." };
  });
}

// ---- Candidates ----------------------------------------------------------------------------

export async function createCandidateAction(electionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  let candidateId = "";
  const result = await runAction("createCandidate", async () => {
    const { actor } = await requirePermissionAction("candidates.write");
    candidateId = await createCandidate(actor, electionId, formObject(formData, CANDIDATE_FIELDS), {
      approve: formBool(formData, "approve"),
      photo: await photoFrom(formData),
    });
    refresh(electionId);
  });
  if (result && !result.ok) return result;
  redirect(`/admin/elections/${electionId}/candidates/${candidateId}?created=1`);
}

export async function updateCandidateAction(electionId: string, candidateId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("updateCandidate", async () => {
    const { actor } = await requirePermissionAction("candidates.write");
    await updateCandidate(actor, candidateId, formObject(formData, CANDIDATE_FIELDS), await photoFrom(formData));
    refresh(electionId);
    return { ok: true, message: "Candidate saved." };
  });
}

export async function decideCandidateAction(
  electionId: string,
  candidateId: string,
  decision: "APPROVED" | "REJECTED",
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction("decideCandidate", async () => {
    const { actor } = await requirePermissionAction("candidates.write");
    await decideCandidate(actor, candidateId, decision === "APPROVED" ? "APPROVED" : "REJECTED", formString(formData, "reason"));
    refresh(electionId);
    return { ok: true, message: decision === "APPROVED" ? "Candidate approved." : "Candidate rejected." };
  });
}

export async function withdrawCandidateAction(electionId: string, candidateId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("withdrawCandidate", async () => {
    const { actor, session } = await requirePermissionAction("candidates.write");
    await withdrawCandidate(actor, candidateId, formString(formData, "reason"), hasRecentReauthentication(session));
    refresh(electionId);
    return { ok: true, message: "Candidate withdrawn." };
  });
}

export async function deactivateCandidateAction(electionId: string, candidateId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("deactivateCandidate", async () => {
    const { actor } = await requirePermissionAction("candidates.write");
    await deactivateCandidate(actor, candidateId, formString(formData, "reason"));
    refresh(electionId);
    return { ok: true, message: "Candidate deactivated." };
  });
}

export async function removeCandidatePhotoAction(electionId: string, candidateId: string): Promise<ActionState> {
  return runAction("removeCandidatePhoto", async () => {
    const { actor } = await requirePermissionAction("candidates.write");
    await removeCandidatePhoto(actor, candidateId);
    refresh(electionId);
    return { ok: true, message: "Photo removed." };
  });
}

// ---- Voter roll ----------------------------------------------------------------------------

export async function addAllToRollAction(electionId: string): Promise<ActionState> {
  return runAction("addAllToRoll", async () => {
    const { actor } = await requirePermissionAction("voters.write");
    const added = await addAllEligibleToRoll(actor, electionId);
    refresh(electionId);
    return { ok: true, message: added ? `${added} approved members added to the voter roll.` : "All approved members are already on the roll." };
  });
}

export async function addMembersToRollAction(electionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("addMembersToRoll", async () => {
    const { actor } = await requirePermissionAction("voters.write");
    const ids = formData.getAll("memberId").filter((v): v is string => typeof v === "string");
    const added = await addMembersToRoll(actor, electionId, ids);
    refresh(electionId);
    return { ok: true, message: `${added} member${added === 1 ? "" : "s"} added to the voter roll.` };
  });
}

export async function removeFromRollAction(electionId: string, memberId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("removeFromRoll", async () => {
    const { actor } = await requirePermissionAction("voters.write");
    await removeFromRoll(actor, electionId, memberId, formString(formData, "reason"));
    refresh(electionId);
    return { ok: true, message: "Member removed from the voter roll." };
  });
}

// ---- Announcements ---------------------------------------------------------------------------

export async function createAnnouncementAction(electionId: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("createAnnouncement", async () => {
    const { actor } = await requirePermissionAction("announcements.write");
    const { emailed } = await createAnnouncement(actor, electionId, formObject(formData, ["title", "body"]), formBool(formData, "email"));
    if (emailed) dispatchEmailsLater();
    if (electionId) refresh(electionId);
    revalidatePath("/dashboard");
    return { ok: true, message: emailed ? `Announcement published and emailed to ${emailed} members.` : "Announcement published." };
  });
}

export async function deleteAnnouncementAction(electionId: string | null, announcementId: string): Promise<ActionState> {
  return runAction("deleteAnnouncement", async () => {
    const { actor } = await requirePermissionAction("announcements.write");
    await deleteAnnouncement(actor, announcementId);
    if (electionId) refresh(electionId);
    revalidatePath("/dashboard");
    return { ok: true, message: "Announcement removed." };
  });
}
