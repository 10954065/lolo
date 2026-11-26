import { AlertTriangle, CheckCircle2, Download, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ActionDialog } from "@/components/forms/action-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { commitImportAction, discardImportAction } from "@/server/actions/members";
import { requirePermissionPage } from "@/server/auth/guards";
import { getImport } from "@/server/services/imports";

export const metadata: Metadata = { title: "Import preview" };

const PREVIEW_LIMIT = 500;
const ROW_BADGE: Record<string, { label: string; className: string }> = {
  valid: { label: "Valid", className: "border-success/30 bg-success-soft text-success" },
  invalid: { label: "Invalid", className: "border-destructive/30 bg-destructive/10 text-destructive" },
  duplicate: { label: "Duplicate", className: "border-warning/30 bg-warning-soft text-warning" },
};

export default async function ImportPreviewPage({ params }: PageProps<"/admin/members/import/[id]">) {
  await requirePermissionPage("members.write");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const batch = await getImport(id);
  if (!batch) notFound();

  const problems = batch.rows.filter((r) => r.status !== "valid");
  const isPreview = batch.status === "PREVIEW";
  const shownRows = [...problems, ...batch.rows.filter((r) => r.status === "valid")].slice(0, PREVIEW_LIMIT);

  return (
    <>
      <PageHeader
        title={batch.fileName}
        description={<StatusBadge status={batch.status} />}
        backHref="/admin/members/import"
        backLabel="Bulk registration"
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Rows in file" value={batch.totalRows} />
        <StatCard label="Ready to import" value={batch.validRows} icon={CheckCircle2} tone="success" />
        <StatCard label="Invalid" value={batch.invalidRows} icon={XCircle} tone={batch.invalidRows ? "danger" : "default"} />
        <StatCard
          label="Duplicates"
          value={batch.duplicateRows}
          icon={AlertTriangle}
          tone={batch.duplicateRows ? "warning" : "default"}
        />
      </div>

      {batch.summary ? (
        <Alert className="mt-6 border-success/40 bg-success-soft" role="status">
          <CheckCircle2 className="size-4 text-success" />
          <AlertTitle className="text-success">Import completed</AlertTitle>
          <AlertDescription className="text-success">
            {batch.summary.created} members registered; {batch.summary.failed.length} rows were not imported.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {isPreview ? (
          <>
            <ActionDialog
              action={commitImportAction.bind(null, batch.id)}
              triggerVariant="default"
              triggerSize="default"
              triggerLabel={`Import ${batch.validRows} member${batch.validRows === 1 ? "" : "s"}`}
              isDisabled={batch.validRows === 0}
              title={`Register ${batch.validRows} members?`}
              description="Only rows marked “Valid” are imported. Problem rows are skipped and listed in the failed-records report."
              confirmLabel="Import members"
            >
              <label className="flex items-start gap-3 text-sm">
                <Checkbox name="approve" className="mt-0.5" />
                <span>
                  <span className="font-medium">Approve all imported members</span>
                  <span className="block text-muted-foreground">
                    Only if this list has already been verified by MOBA 2017.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <Checkbox name="notify" className="mt-0.5" />
                <span className="font-medium">Email a registration confirmation to each member</span>
              </label>
            </ActionDialog>
            <ActionDialog
              action={discardImportAction.bind(null, batch.id)}
              triggerSize="default"
              triggerLabel="Discard"
              title="Discard this import?"
              description="No members will be added. You can upload a corrected file."
              confirmLabel="Discard import"
              isDestructive
            />
          </>
        ) : null}
        {problems.length > 0 ? (
          <Button variant="outline" asChild>
            <a href={`/api/exports/imports/${batch.id}/failed`}>
              <Download className="size-4" /> Download failed records ({problems.length})
            </a>
          </Button>
        ) : null}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Rows{problems.length ? " (problems listed first)" : ""}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Row</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="hidden md:table-cell">Membership no.</TableHead>
                  <TableHead>Problem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shownRows.map((r) => (
                  <TableRow key={r.rowNumber}>
                    <TableCell className="tabular-nums">{r.rowNumber}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={ROW_BADGE[r.status].className}>
                        {ROW_BADGE[r.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell>{r.normalized?.fullName ?? r.input.fullName ?? ""}</TableCell>
                    <TableCell className="max-w-56 truncate">{r.normalized?.email ?? r.input.email ?? ""}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {r.normalized?.membershipNumber ?? r.input.membershipNumber ?? ""}
                    </TableCell>
                    <TableCell className="text-sm text-destructive">{r.errors.join("; ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {batch.rows.length > PREVIEW_LIMIT ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Showing the first {PREVIEW_LIMIT} rows. All problem rows are included in the failed-records download.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
