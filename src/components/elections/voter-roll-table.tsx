import type { ReactNode } from "react";
import { StatusBadge } from "@/components/shared/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/datetime";
import type { listVoterRoll } from "@/server/services/voter-roll";

type Rows = Awaited<ReturnType<typeof listVoterRoll>>["rows"];

/** Voter roll with participation: shows WHO voted and WHEN — never what they chose. */
export function VoterRollTable({ rows, renderAction }: { rows: Rows; renderAction?: (row: Rows[number]) => ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead className="hidden md:table-cell">Membership no.</TableHead>
            <TableHead className="hidden sm:table-cell">Account</TableHead>
            <TableHead>Participation</TableHead>
            {renderAction ? <TableHead className="text-right">Action</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                No members on the voter roll match.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.memberId}>
                <TableCell>
                  <p className="font-medium">{r.fullName}</p>
                  <p className="text-xs text-muted-foreground">{r.email}</p>
                </TableCell>
                <TableCell className="hidden md:table-cell">{r.membershipNumber ?? "None"}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  <StatusBadge status={r.accountStatus} />
                </TableCell>
                <TableCell>
                  {r.votedAt ? (
                    <span className="text-sm text-success">Voted {formatDateTime(r.votedAt)}</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Not voted</span>
                  )}
                </TableCell>
                {renderAction ? <TableCell className="text-right">{renderAction(r)}</TableCell> : null}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
