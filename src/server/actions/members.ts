"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { requirePermissionAction } from "@/server/auth/guards";
import { validationError } from "@/server/errors";
import {
  approveMembers,
  createMember,
  deactivateMember,
  reactivateMember,
  rejectMember,
  suspendMember,
  updateMember,
} from "@/server/services/members";
import { commitImport, discardImport, MAX_IMPORT_BYTES, previewImport } from "@/server/services/imports";
import { dispatchEmailsLater } from "./background";
import { formBool, formObject, formString, runAction } from "./run-action";

const MEMBER_FIELDS = ["fullName", "email", "phone", "membershipNumber", "gender", "notes"] as const;

function revalidateMembers(memberId?: string): void {
  revalidatePath("/admin/members");
  revalidatePath("/admin");
  revalidatePath("/admin/credentials");
  if (memberId) revalidatePath(`/admin/members/${memberId}`);
}

export async function createMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let memberId = "";
  const result = await runAction("createMember", async () => {
    const { actor } = await requirePermissionAction("members.write");
    memberId = await createMember(actor, formObject(formData, MEMBER_FIELDS), {
      approve: formBool(formData, "approve"),
      notify: formBool(formData, "notify"),
    });
    dispatchEmailsLater();
    revalidateMembers();
  });
  if (result && !result.ok) return result;
  redirect(`/admin/members/${memberId}?created=1`);
}

export async function updateMemberAction(memberId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("updateMember", async () => {
    const { actor } = await requirePermissionAction("members.write");
    await updateMember(actor, memberId, formObject(formData, MEMBER_FIELDS));
    revalidateMembers(memberId);
    return { ok: true, message: "Member details saved." };
  });
}

export async function approveMembersAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("approveMembers", async () => {
    const { actor } = await requirePermissionAction("members.write");
    const ids = formData.getAll("memberId").filter((v): v is string => typeof v === "string");
    const approved = await approveMembers(actor, ids, formBool(formData, "notify"));
    dispatchEmailsLater();
    revalidateMembers(ids.length === 1 ? ids[0] : undefined);
    return {
      ok: true,
      message: approved === 0 ? "The selected members were already approved." : `${approved} member${approved === 1 ? "" : "s"} approved.`,
    };
  });
}

export async function rejectMemberAction(memberId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("rejectMember", async () => {
    const { actor } = await requirePermissionAction("members.write");
    await rejectMember(actor, memberId, formString(formData, "reason"));
    revalidateMembers(memberId);
    return { ok: true, message: "Member registration rejected." };
  });
}

export async function suspendMemberAction(memberId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("suspendMember", async () => {
    const { actor } = await requirePermissionAction("members.write");
    await suspendMember(actor, memberId, formString(formData, "reason"));
    revalidateMembers(memberId);
    return { ok: true, message: "Member account suspended and signed out everywhere." };
  });
}

export async function reactivateMemberAction(memberId: string): Promise<ActionState> {
  return runAction("reactivateMember", async () => {
    const { actor } = await requirePermissionAction("members.write");
    await reactivateMember(actor, memberId);
    revalidateMembers(memberId);
    return { ok: true, message: "Member account reactivated." };
  });
}

export async function deactivateMemberAction(memberId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("deactivateMember", async () => {
    const { actor } = await requirePermissionAction("members.write");
    await deactivateMember(actor, memberId, formString(formData, "reason"));
    revalidateMembers(memberId);
    return { ok: true, message: "Member deactivated. The record is retained for the audit trail." };
  });
}

// ---- CSV bulk registration ---------------------------------------------------------------

const ALLOWED_CSV_TYPES = new Set(["text/csv", "application/vnd.ms-excel", "text/plain", "application/csv", ""]);

export async function uploadImportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let importId = "";
  const result = await runAction("uploadImport", async () => {
    const { actor } = await requirePermissionAction("members.write");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw validationError("Choose a CSV file to upload.", { file: ["Choose a CSV file to upload."] });
    }
    if (!file.name.toLowerCase().endsWith(".csv") || !ALLOWED_CSV_TYPES.has(file.type)) {
      throw validationError("Only .csv files are accepted. In Excel use File → Save As → CSV UTF-8.", {
        file: ["Only .csv files are accepted."],
      });
    }
    if (file.size > MAX_IMPORT_BYTES) throw validationError("The file is larger than 2 MB.", { file: ["The file is larger than 2 MB."] });
    importId = await previewImport(actor, file.name, await file.text());
  });
  if (result && !result.ok) return result;
  redirect(`/admin/members/import/${importId}`);
}

export async function commitImportAction(importId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("commitImport", async () => {
    const { actor } = await requirePermissionAction("members.write");
    const summary = await commitImport(actor, importId, {
      approve: formBool(formData, "approve"),
      notify: formBool(formData, "notify"),
    });
    dispatchEmailsLater();
    revalidateMembers();
    revalidatePath(`/admin/members/import/${importId}`);
    return {
      ok: true,
      message: `${summary.created} member${summary.created === 1 ? "" : "s"} registered. ${summary.failed.length} row${summary.failed.length === 1 ? " was" : "s were"} not imported.`,
    };
  });
}

export async function discardImportAction(importId: string): Promise<ActionState> {
  const result = await runAction("discardImport", async () => {
    const { actor } = await requirePermissionAction("members.write");
    await discardImport(actor, importId);
  });
  if (result && !result.ok) return result;
  redirect("/admin/members/import?discarded=1");
}
