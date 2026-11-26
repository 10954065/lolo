/**
 * Role & permission enforcement at the service layer — the layer every action, page and
 * route handler goes through. The Electoral Committee and voters must be rejected by every
 * mutating operation even when called directly.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/auth/actor";
import { closeDb } from "@/server/db/client";
import { setEmailTransportForTests } from "@/server/email/transport";
import {
  changeStaffRole,
  createStaffAccount,
  listStaffAccounts,
  resetStaffCredentials,
  revokeStaffSessions,
  setStaffStatus,
} from "@/server/services/accounts";
import { verifyAuditChain } from "@/server/services/audit";
import { issueCredentials, regenerateCredentials } from "@/server/services/credentials";
import { retryEmailJob } from "@/server/services/email-queue";
import { commitImport, discardImport, previewImport } from "@/server/services/imports";
import {
  approveMembers,
  createMember,
  deactivateMember,
  reactivateMember,
  rejectMember,
  suspendMember,
  updateMember,
} from "@/server/services/members";
import { updateSettings } from "@/server/services/settings";
import { createStaff, MemoryTransport, resetDatabase, type TestStaff } from "../support/db";

const mail = new MemoryTransport();
let admin: TestStaff;
let committee: TestStaff;
let memberId: string;
const voter: Actor = { userId: null, role: "VOTER", label: "voter" };
const FAKE_ID = "00000000-0000-4000-8000-000000000000";

beforeAll(() => setEmailTransportForTests(mail));
afterAll(async () => {
  setEmailTransportForTests(null);
  await closeDb();
});
beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("SYSTEM_ADMIN");
  committee = await createStaff("ELECTORAL_COMMITTEE");
  memberId = await createMember(admin.actor, { fullName: "Kojo Antwi", email: "kojo@example.com" });
});

/** Every mutating service, invoked with the given actor. */
function mutations(actor: Actor): Array<[string, () => Promise<unknown>]> {
  return [
    ["createMember", () => createMember(actor, { fullName: "X Y", email: "x@example.com" })],
    ["updateMember", () => updateMember(actor, memberId, { fullName: "Changed", email: "kojo@example.com" })],
    ["approveMembers", () => approveMembers(actor, [memberId])],
    ["rejectMember", () => rejectMember(actor, memberId, "some reason here")],
    ["suspendMember", () => suspendMember(actor, memberId, "some reason here")],
    ["reactivateMember", () => reactivateMember(actor, memberId)],
    ["deactivateMember", () => deactivateMember(actor, memberId, "some reason here")],
    ["issueCredentials", () => issueCredentials(actor, "ALL_ELIGIBLE")],
    ["regenerateCredentials", () => regenerateCredentials(actor, memberId, "some reason here", true)],
    ["retryEmailJob", () => retryEmailJob(actor, FAKE_ID)],
    ["previewImport", () => previewImport(actor, "a.csv", "full_name,email\nA B,ab@example.com\n")],
    ["commitImport", () => commitImport(actor, FAKE_ID, { approve: true, notify: false })],
    ["discardImport", () => discardImport(actor, FAKE_ID)],
    ["updateSettings", () => updateSettings(actor, { organizationName: "Hacked" })],
    ["createStaffAccount", () => createStaffAccount(actor, { fullName: "Evil", email: "evil@example.com", role: "SYSTEM_ADMIN" }, true)],
    ["changeStaffRole", () => changeStaffRole(actor, admin.id, "ELECTORAL_COMMITTEE", "some reason here", true)],
    ["setStaffStatus", () => setStaffStatus(actor, admin.id, "SUSPENDED", "some reason here", true)],
    ["resetStaffCredentials", () => resetStaffCredentials(actor, admin.id, "some reason here", true)],
    ["revokeStaffSessions(other)", () => revokeStaffSessions(actor, admin.id, "x")],
  ];
}

describe("Electoral Committee is strictly read-only", () => {
  it.each(mutations({ userId: "c", role: "ELECTORAL_COMMITTEE", label: "committee" }))(
    "rejects %s",
    async (_name, call) => {
      await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );

  it("leaves no trace of the attempted changes", async () => {
    for (const [, call] of mutations(committee.actor)) await call().catch(() => undefined);
    const accounts = await listStaffAccounts();
    expect(accounts.find((a) => a.id === admin.id)?.status).toBe("ACTIVE");
    expect(accounts.find((a) => a.id === admin.id)?.role).toBe("SYSTEM_ADMIN");
    expect(accounts.some((a) => a.email === "evil@example.com")).toBe(false);
  });
});

describe("voters cannot perform administrative operations", () => {
  it.each(mutations(voter))("rejects %s", async (_name, call) => {
    await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("staff account management", () => {
  it("requires step-up re-authentication", async () => {
    await expect(
      createStaffAccount(admin.actor, { fullName: "Akosua Darko", email: "akosua@example.com", role: "ELECTORAL_COMMITTEE" }, false),
    ).rejects.toMatchObject({ code: "REAUTH_REQUIRED" });
  });

  it("creates committee accounts that must change their password", async () => {
    await createStaffAccount(admin.actor, { fullName: "Akosua Darko", email: "akosua@example.com", role: "ELECTORAL_COMMITTEE" }, true);
    const account = (await listStaffAccounts()).find((a) => a.email === "akosua@example.com");
    expect(account?.role).toBe("ELECTORAL_COMMITTEE");
    expect(account?.mustChangePassword).toBe(true);
  });

  it("never allows the last active administrator to be demoted or suspended", async () => {
    const other = await createStaff("SYSTEM_ADMIN");
    await setStaffStatus(admin.actor, other.id, "SUSPENDED", "left the committee", true);
    await expect(changeStaffRole(other.actor, admin.id, "ELECTORAL_COMMITTEE", "testing reason", true)).rejects.toMatchObject({
      code: "BUSINESS_RULE",
    });
  });

  it("does not allow changing your own role or status", async () => {
    await expect(changeStaffRole(admin.actor, admin.id, "ELECTORAL_COMMITTEE", "testing reason", true)).rejects.toMatchObject({
      code: "BUSINESS_RULE",
    });
    await expect(setStaffStatus(admin.actor, admin.id, "SUSPENDED", "testing reason", true)).rejects.toMatchObject({
      code: "BUSINESS_RULE",
    });
  });

  it("audits permission changes in the verified chain", async () => {
    await changeStaffRole(admin.actor, committee.id, "SYSTEM_ADMIN", "Promoted by committee resolution", true);
    const verification = await verifyAuditChain();
    expect(verification.isValid).toBe(true);
  });
});
