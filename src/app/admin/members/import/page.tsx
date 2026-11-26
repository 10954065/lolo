import { Download, FileSpreadsheet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/datetime";
import { requirePermissionPage } from "@/server/auth/guards";
import { EXPECTED_COLUMNS, listImports } from "@/server/services/imports";
import { UploadImportForm } from "./upload-form";

export const metadata: Metadata = { title: "Bulk registration" };

export default async function ImportPage({ searchParams }: PageProps<"/admin/members/import">) {
  await requirePermissionPage("members.write");
  const [imports, query] = await Promise.all([listImports(), searchParams]);

  return (
    <>
      <PageHeader
        title="Bulk registration"
        description="Upload the MOBA 2017 member list as a CSV file. You will see a preview with every problem highlighted before anything is saved."
        backHref="/admin/members"
        backLabel="All members"
      />
      {query.discarded === "1" ? (
        <Alert className="mb-6" role="status">
          <AlertDescription>The import was discarded. No members were added.</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-brand" aria-hidden /> Upload CSV file
            </CardTitle>
            <CardDescription>Maximum 2 MB and 5,000 rows per file.</CardDescription>
          </CardHeader>
          <CardContent>
            <UploadImportForm />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>File format</CardTitle>
            <CardDescription>The first row must contain column headings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Columns: <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{EXPECTED_COLUMNS}</code>
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                Headings are flexible: “Full Name”, “Name”, “Email Address”, “Phone Number” and “Member ID” are all
                recognised.
              </li>
              <li>From Excel choose File → Save As → “CSV UTF-8 (Comma delimited)”.</li>
              <li>Duplicates (within the file or already registered) and invalid emails are reported and skipped.</li>
            </ul>
            <Button variant="outline" size="sm" asChild>
              <a href="/templates/moba-members-template.csv" download>
                <Download className="size-4" /> Download template
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent imports</CardTitle>
        </CardHeader>
        <CardContent>
          {imports.length === 0 ? (
            <p className="text-sm text-muted-foreground">No files have been uploaded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Rows</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Valid</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Problems</TableHead>
                    <TableHead className="hidden md:table-cell">Uploaded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {imports.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        <Link
                          href={`/admin/members/import/${i.id}`}
                          className="font-medium text-navy hover:text-brand hover:underline"
                        >
                          {i.fileName}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={i.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{i.totalRows}</TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">{i.validRows}</TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">
                        {i.invalidRows + i.duplicateRows}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{formatDateTime(i.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
