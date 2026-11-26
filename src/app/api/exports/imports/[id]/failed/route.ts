import { z } from "zod";
import { requirePermissionAction } from "@/server/auth/guards";
import { notFound } from "@/server/errors";
import { handleRoute } from "@/server/http";
import { csvResponse, toCsv } from "@/server/reports/csv";
import { getImport } from "@/server/services/imports";

export async function GET(_request: Request, ctx: RouteContext<"/api/exports/imports/[id]/failed">): Promise<Response> {
  return handleRoute("exportImportFailures", async () => {
    await requirePermissionAction("members.write");
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) throw notFound();
    const batch = await getImport(id);
    if (!batch) throw notFound("Import not found.");
    const problems = batch.rows.filter((r) => r.status !== "valid");
    const body = toCsv(
      ["Row", "Problem", "full_name", "email", "phone", "membership_number", "gender"],
      problems.map((r) => [
        r.rowNumber,
        r.errors.join("; "),
        r.input.fullName,
        r.input.email,
        r.input.phone,
        r.input.membershipNumber,
        r.input.gender,
      ]),
    );
    return csvResponse(`failed-rows-${batch.fileName.replace(/\.csv$/i, "")}.csv`, body);
  });
}
