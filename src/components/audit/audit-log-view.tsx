import { Download, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { NativeSelect } from "@/components/forms/native-select";
import { Pagination } from "@/components/shared/pagination";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/datetime";
import { verifyAuditChain } from "@/server/services/audit";
import { auditFiltersSchema, distinctAuditActions, listAuditLogs } from "@/server/services/audit-queries";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Read-only audit trail shared by the System Administrator and the Electoral Committee.
 * Verification recomputes the SHA-256 hash chain over every entry.
 */
export async function AuditLogView({ searchParams, basePath }: { searchParams: SearchParams; basePath: string }) {
  const filters = auditFiltersSchema.parse(searchParams);
  const shouldVerify = searchParams.verify === "1";
  const [result, actions, verification] = await Promise.all([
    listAuditLogs(filters),
    distinctAuditActions(),
    shouldVerify ? verifyAuditChain() : Promise.resolve(null),
  ]);
  const params = {
    q: filters.q,
    action: filters.action,
    resourceType: filters.resourceType,
    from: filters.from,
    to: filters.to,
  };
  const activeParams = Object.fromEntries(
    Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])),
  );
  const exportQuery = new URLSearchParams(activeParams);

  return (
    <div className="space-y-4">
      {verification ? (
        verification.isValid ? (
          <Alert className="border-success/40 bg-success-soft" role="status">
            <ShieldCheck className="size-4 text-success" />
            <AlertTitle className="text-success">Audit trail verified</AlertTitle>
            <AlertDescription className="text-success">
              All {verification.checked} entries are intact and in sequence. Chain head:{" "}
              <code className="break-all font-mono text-xs">{verification.headHash}</code>
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="destructive" role="alert">
            <ShieldAlert className="size-4" />
            <AlertTitle>Audit trail integrity problem</AlertTitle>
            <AlertDescription>
              Entry #{verification.firstInvalidId} does not match the hash chain. {verification.checked} entries before
              it verified correctly. Report this to the Electoral Committee immediately.
            </AlertDescription>
          </Alert>
        )
      ) : null}

      <form
        method="get"
        action={basePath}
        className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1.5fr_1fr_1fr_auto]"
      >
        <div className="space-y-1.5">
          <Label htmlFor="q">Search</Label>
          <Input id="q" name="q" defaultValue={filters.q ?? ""} placeholder="Summary or person" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="action">Action</Label>
          <NativeSelect id="action" name="action" defaultValue={filters.action ?? ""}>
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a.replaceAll("_", " ").toLowerCase()}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="from">From</Label>
          <Input id="from" name="from" type="date" defaultValue={filters.from ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">To</Label>
          <Input id="to" name="to" type="date" defaultValue={filters.to ?? ""} />
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit">Apply</Button>
          <Button variant="ghost" asChild>
            <Link href={basePath}>Reset</Link>
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={`${basePath}?${new URLSearchParams({ ...activeParams, verify: "1" })}`}>
            <ShieldCheck className="size-4" /> Verify integrity
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href={`/api/exports/audit?${exportQuery}`}>
            <Download className="size-4" /> Export CSV
          </a>
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">#</TableHead>
              <TableHead className="w-44">When (GMT)</TableHead>
              <TableHead>What happened</TableHead>
              <TableHead className="hidden lg:table-cell">Who</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No audit entries match these filters.
                </TableCell>
              </TableRow>
            ) : (
              result.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="align-top tabular-nums text-muted-foreground">{r.id}</TableCell>
                  <TableCell className="align-top text-sm">{formatDateTime(r.occurredAt)}</TableCell>
                  <TableCell className="align-top whitespace-normal">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                      {r.action.replaceAll("_", " ")}
                    </p>
                    <p className="text-sm">{r.summary}</p>
                    {r.reason ? <p className="text-sm text-muted-foreground">Reason: {r.reason}</p> : null}
                    <p className="text-xs text-muted-foreground lg:hidden">{r.actorLabel}</p>
                  </TableCell>
                  <TableCell className="hidden align-top text-sm lg:table-cell">
                    {r.actorLabel}
                    {r.ipAddress ? <p className="text-xs text-muted-foreground">{r.ipAddress}</p> : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Pagination page={result.page} pageSize={result.pageSize} total={result.total} params={params} basePath={basePath} />
    </div>
  );
}
