import { requirePermissionAction } from "@/server/auth/guards";
import { handleRoute } from "@/server/http";
import { csvResponse, toCsv } from "@/server/reports/csv";
import { audit } from "@/server/services/audit";
import { auditFiltersSchema, exportAuditLogs } from "@/server/services/audit-queries";

export async function GET(request: Request): Promise<Response> {
  return handleRoute("exportAudit", async () => {
    const { actor } = await requirePermissionAction("audit.read");
    const filters = auditFiltersSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const rows = await exportAuditLogs(filters);
    await audit(actor, {
      action: "REPORT_EXPORTED",
      resourceType: "report",
      resourceId: "audit_log",
      summary: `Exported administrative activity report (${rows.length} entries) as CSV`,
    });
    const body = toCsv(
      [
        "#",
        "Occurred (UTC)",
        "Action",
        "Summary",
        "Reason",
        "Actor",
        "Actor role",
        "Resource type",
        "Resource id",
        "IP address",
        "Previous hash",
        "Hash",
      ],
      rows.map((r) => [
        r.id,
        r.occurredAt,
        r.action,
        r.summary,
        r.reason,
        r.actorLabel,
        r.actorRole,
        r.resourceType,
        r.resourceId,
        r.ipAddress,
        r.prevHash,
        r.hash,
      ]),
    );
    return csvResponse(`moba2017-audit-log-${new Date().toISOString().slice(0, 10)}.csv`, body);
  });
}
