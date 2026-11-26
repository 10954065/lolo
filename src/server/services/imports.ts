import "server-only";
import Papa from "papaparse";
import { desc, eq, inArray, sql } from "drizzle-orm";
import type { Actor } from "@/server/auth/actor";
import { assertCan } from "@/server/auth/permissions";
import { getDb } from "@/server/db/client";
import { memberImports, members, type ImportRowResult, type ImportSummary } from "@/server/db/schema";
import { businessRule, notFound, validationError } from "@/server/errors";
import { memberInputSchema } from "@/server/validation/members";
import { recordAudit } from "./audit";
import { enqueueEmail } from "./email-queue";

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;
const INSERT_CHUNK = 500;

/** Accepted header spellings (normalized: lowercase, letters/digits only). */
const HEADER_ALIASES: Record<string, keyof NonNullable<ImportRowResult["normalized"]>> = {
  fullname: "fullName",
  name: "fullName",
  membername: "fullName",
  email: "email",
  emailaddress: "email",
  phone: "phone",
  phonenumber: "phone",
  mobile: "phone",
  telephone: "phone",
  tel: "phone",
  membershipnumber: "membershipNumber",
  membershipno: "membershipNumber",
  memberno: "membershipNumber",
  memberid: "membershipNumber",
  idnumber: "membershipNumber",
  gender: "gender",
  sex: "gender",
};

export const EXPECTED_COLUMNS = "full_name, email, phone (optional), membership_number (optional), gender (optional)";

function normalizeHeader(header: string): string {
  return header.replace(/^﻿/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeGender(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  if (["m", "male"].includes(v)) return "Male";
  if (["f", "female"].includes(v)) return "Female";
  if (v === "other") return "Other";
  if (["prefer not to say", "n/a", "na", "-"].includes(v)) return "Prefer not to say";
  return value;
}

/** Parse and validate CSV text into per-row results (no database access). */
export function parseMemberCsv(text: string): ImportRowResult[] {
  if (text.length > MAX_IMPORT_BYTES) throw validationError("The file is larger than 2 MB.");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => HEADER_ALIASES[normalizeHeader(h)] ?? `__ignored_${normalizeHeader(h)}`,
  });
  const fields = parsed.meta.fields ?? [];
  if (!fields.includes("fullName") || !fields.includes("email")) {
    throw validationError(`The file must have a header row with at least full_name and email columns. Expected: ${EXPECTED_COLUMNS}.`);
  }
  if (parsed.data.length === 0) throw validationError("The file contains no member rows.");
  if (parsed.data.length > MAX_IMPORT_ROWS) {
    throw validationError(`The file has ${parsed.data.length} rows; the maximum per import is ${MAX_IMPORT_ROWS}.`);
  }

  const seenEmails = new Map<string, number>();
  const seenNumbers = new Map<string, number>();
  return parsed.data.map((raw, index): ImportRowResult => {
    const rowNumber = index + 2; // header is row 1
    const input = {
      fullName: raw.fullName ?? "",
      email: raw.email ?? "",
      phone: raw.phone ?? "",
      membershipNumber: raw.membershipNumber ?? "",
      gender: normalizeGender(raw.gender) ?? "",
    };
    const result = memberInputSchema.safeParse(input);
    if (!result.success) {
      return {
        rowNumber,
        input,
        status: "invalid",
        errors: result.error.issues.map((i) => `${String(i.path[0] ?? "row")}: ${i.message}`),
      };
    }
    const normalized = {
      fullName: result.data.fullName,
      email: result.data.email,
      phone: result.data.phone ?? null,
      membershipNumber: result.data.membershipNumber ?? null,
      gender: result.data.gender ?? null,
    };
    const errors: string[] = [];
    const firstEmailRow = seenEmails.get(normalized.email);
    if (firstEmailRow) errors.push(`email: duplicate of row ${firstEmailRow} in this file`);
    else seenEmails.set(normalized.email, rowNumber);
    if (normalized.membershipNumber) {
      const key = normalized.membershipNumber.toLowerCase();
      const firstNumberRow = seenNumbers.get(key);
      if (firstNumberRow) errors.push(`membershipNumber: duplicate of row ${firstNumberRow} in this file`);
      else seenNumbers.set(key, rowNumber);
    }
    return { rowNumber, input, status: errors.length ? "duplicate" : "valid", errors, normalized };
  });
}

/** Mark rows that already exist in the database as duplicates. */
async function markExistingDuplicates(rows: ImportRowResult[]): Promise<ImportRowResult[]> {
  const emails = rows.filter((r) => r.normalized).map((r) => r.normalized!.email);
  const numbers = rows
    .filter((r) => r.normalized?.membershipNumber)
    .map((r) => r.normalized!.membershipNumber!.toLowerCase());
  const db = getDb();
  const existingEmails = new Set<string>();
  const existingNumbers = new Set<string>();
  for (let i = 0; i < emails.length; i += INSERT_CHUNK) {
    const chunk = emails.slice(i, i + INSERT_CHUNK);
    const found = await db
      .select({ email: sql<string>`lower(${members.email})` })
      .from(members)
      .where(inArray(sql`lower(${members.email})`, chunk));
    found.forEach((f) => existingEmails.add(f.email));
  }
  for (let i = 0; i < numbers.length; i += INSERT_CHUNK) {
    const chunk = numbers.slice(i, i + INSERT_CHUNK);
    const found = await db
      .select({ n: sql<string>`lower(${members.membershipNumber})` })
      .from(members)
      .where(inArray(sql`lower(${members.membershipNumber})`, chunk));
    found.forEach((f) => existingNumbers.add(f.n));
  }
  return rows.map((row) => {
    if (row.status !== "valid" || !row.normalized) return row;
    const errors: string[] = [];
    if (existingEmails.has(row.normalized.email)) errors.push("email: a member with this email is already registered");
    if (row.normalized.membershipNumber && existingNumbers.has(row.normalized.membershipNumber.toLowerCase())) {
      errors.push("membershipNumber: already registered to another member");
    }
    return errors.length ? { ...row, status: "duplicate", errors } : row;
  });
}

export async function previewImport(actor: Actor, fileName: string, text: string): Promise<string> {
  assertCan(actor, "members.write");
  const rows = await markExistingDuplicates(parseMemberCsv(text));
  const tally = (s: ImportRowResult["status"]) => rows.filter((r) => r.status === s).length;
  return getDb().transaction(async (tx) => {
    const [created] = await tx
      .insert(memberImports)
      .values({
        fileName: fileName.slice(0, 200),
        totalRows: rows.length,
        validRows: tally("valid"),
        invalidRows: tally("invalid"),
        duplicateRows: tally("duplicate"),
        rows,
        createdBy: actor.userId,
      })
      .returning({ id: memberImports.id });
    await recordAudit(tx, actor, {
      action: "MEMBER_IMPORT_PREVIEWED",
      resourceType: "member_import",
      resourceId: created.id,
      summary: `Uploaded ${fileName}: ${rows.length} rows (${tally("valid")} valid, ${tally("invalid")} invalid, ${tally("duplicate")} duplicate)`,
    });
    return created.id;
  });
}

export interface CommitOptions {
  approve: boolean;
  notify: boolean;
}

export async function commitImport(actor: Actor, importId: string, options: CommitOptions): Promise<ImportSummary> {
  assertCan(actor, "members.write");
  return getDb().transaction(async (tx) => {
    const [batch] = await tx.select().from(memberImports).where(eq(memberImports.id, importId)).for("update");
    if (!batch) throw notFound("Import not found.");
    if (batch.status !== "PREVIEW") throw businessRule("This import has already been completed or discarded.");

    const valid = batch.rows.filter((r) => r.status === "valid" && r.normalized);
    const now = new Date();
    const createdEmails = new Set<string>();
    const createdMembers: Array<{ id: string; email: string; fullName: string }> = [];
    for (let i = 0; i < valid.length; i += INSERT_CHUNK) {
      const chunk = valid.slice(i, i + INSERT_CHUNK);
      const inserted = await tx
        .insert(members)
        .values(
          chunk.map((r) => ({
            ...r.normalized!,
            importId,
            approvalStatus: options.approve ? ("APPROVED" as const) : ("PENDING" as const),
            approvedAt: options.approve ? now : null,
            approvedBy: options.approve ? actor.userId : null,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: members.id, email: members.email, fullName: members.fullName });
      inserted.forEach((m) => {
        createdEmails.add(m.email.toLowerCase());
        createdMembers.push(m);
      });
    }

    const failed: ImportSummary["failed"] = batch.rows
      .filter((r) => r.status !== "valid")
      .map((r) => ({ rowNumber: r.rowNumber, email: r.input.email ?? "", reason: r.errors.join("; ") }));
    for (const r of valid) {
      if (!createdEmails.has(r.normalized!.email)) {
        failed.push({ rowNumber: r.rowNumber, email: r.normalized!.email, reason: "Already registered (added since preview)" });
      }
    }
    const summary: ImportSummary = { created: createdMembers.length, skipped: valid.length - createdMembers.length, failed };

    if (options.notify) {
      for (const m of createdMembers) {
        await enqueueEmail(tx, {
          template: options.approve ? "member_approved" : "registration_confirmation",
          to: m.email,
          vars: { recipientName: m.fullName, email: m.email },
          memberId: m.id,
        });
      }
    }
    await tx
      .update(memberImports)
      .set({ status: "COMMITTED", committedAt: now, summary })
      .where(eq(memberImports.id, importId));
    await recordAudit(tx, actor, {
      action: "MEMBER_IMPORT_COMMITTED",
      resourceType: "member_import",
      resourceId: importId,
      summary: `Imported ${summary.created} members from ${batch.fileName}${options.approve ? " (approved)" : ""}; ${failed.length} rows not imported`,
      metadata: { created: summary.created, notImported: failed.length, approved: options.approve },
    });
    return summary;
  });
}

export async function discardImport(actor: Actor, importId: string): Promise<void> {
  assertCan(actor, "members.write");
  await getDb().transaction(async (tx) => {
    const [batch] = await tx.select().from(memberImports).where(eq(memberImports.id, importId)).for("update");
    if (!batch) throw notFound("Import not found.");
    if (batch.status !== "PREVIEW") throw businessRule("Only imports awaiting confirmation can be discarded.");
    await tx.update(memberImports).set({ status: "DISCARDED" }).where(eq(memberImports.id, importId));
    await recordAudit(tx, actor, {
      action: "MEMBER_IMPORT_DISCARDED",
      resourceType: "member_import",
      resourceId: importId,
      summary: `Discarded import of ${batch.fileName}`,
    });
  });
}

export async function getImport(importId: string) {
  const [batch] = await getDb().select().from(memberImports).where(eq(memberImports.id, importId)).limit(1);
  return batch ?? null;
}

export async function listImports(limit = 20) {
  return getDb()
    .select({
      id: memberImports.id,
      fileName: memberImports.fileName,
      status: memberImports.status,
      totalRows: memberImports.totalRows,
      validRows: memberImports.validRows,
      invalidRows: memberImports.invalidRows,
      duplicateRows: memberImports.duplicateRows,
      summary: memberImports.summary,
      createdAt: memberImports.createdAt,
      committedAt: memberImports.committedAt,
    })
    .from(memberImports)
    .orderBy(desc(memberImports.createdAt))
    .limit(limit);
}
