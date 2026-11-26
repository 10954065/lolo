import { RefreshCw } from "lucide-react";
import { ActionButton } from "@/components/forms/action-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/datetime";
import { retryEmailAction } from "@/server/actions/credentials";
import { TEMPLATE_LABELS, type EmailTemplate } from "@/server/email/templates";
import type { listEmailJobs } from "@/server/services/email-queue";

type Rows = Awaited<ReturnType<typeof listEmailJobs>>["rows"];

/** Delivery log. Message bodies are never stored in readable form and never shown. */
export function EmailJobsTable({ rows, canRetry }: { rows: Rows; canRetry: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Recipient</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden text-right md:table-cell">Attempts</TableHead>
            <TableHead className="hidden lg:table-cell">Queued</TableHead>
            {canRetry ? <TableHead className="text-right">Action</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const isRetryable =
              (r.status === "FAILED" || r.status === "BOUNCED") && (r.template !== "credentials" || r.hasSecret);
            return (
              <TableRow key={r.id}>
                <TableCell className="max-w-56 truncate">{r.toEmail}</TableCell>
                <TableCell>
                  {TEMPLATE_LABELS[r.template as EmailTemplate] ?? r.template}
                  {r.lastError ? (
                    <p className="max-w-xs truncate text-xs text-destructive" title={r.lastError}>
                      {r.lastError}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
                <TableCell className="hidden text-right tabular-nums md:table-cell">{r.attempts}</TableCell>
                <TableCell className="hidden lg:table-cell">{formatDateTime(r.createdAt)}</TableCell>
                {canRetry ? (
                  <TableCell className="text-right">
                    {isRetryable ? (
                      <ActionButton
                        action={retryEmailAction.bind(null, r.id)}
                        label={
                          <>
                            <RefreshCw className="size-3.5" /> Retry
                          </>
                        }
                        pendingLabel="Queuing…"
                      />
                    ) : null}
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
