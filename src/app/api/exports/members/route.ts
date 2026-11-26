import { requirePermissionAction } from "@/server/auth/guards";
import { handleRoute } from "@/server/http";
import { csvResponse, toCsv } from "@/server/reports/csv";
import { audit } from "@/server/services/audit";
import { exportMembers } from "@/server/services/members";

export async function GET(request: Request): Promise<Response> {
  return handleRoute("exportMembers", async () => {
    const { actor } = await requirePermissionAction("members.read");
    const includeDeactivated = new URL(request.url).searchParams.get("includeDeactivated") === "1";
    const rows = await exportMembers(includeDeactivated);
    await audit(actor, {
      action: "REPORT_EXPORTED",
      resourceType: "report",
      resourceId: "members",
      summary: `Exported member register (${rows.length} records) as CSV`,
    });
    const body = toCsv(
      [
        "Full name",
        "Email",
        "Phone",
        "Membership number",
        "Gender",
        "Approval",
        "Account",
        "Credentials",
        "Registered (UTC)",
        "Approved (UTC)",
      ],
      rows.map((m) => [
        m.fullName,
        m.email,
        m.phone,
        m.membershipNumber,
        m.gender,
        m.approvalStatus,
        m.accountStatus,
        m.credentialStatus,
        m.registeredAt,
        m.approvedAt,
      ]),
    );
    return csvResponse(`moba2017-members-${new Date().toISOString().slice(0, 10)}.csv`, body);
  });
}
