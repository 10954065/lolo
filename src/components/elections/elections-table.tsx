import Link from "next/link";
import { StatusBadge } from "@/components/shared/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/datetime";
import { effectiveStatus } from "@/lib/election-rules";
import type { listElections } from "@/server/services/elections";

type Rows = Awaited<ReturnType<typeof listElections>>;

export function ElectionsTable({ rows, now, basePath }: { rows: Rows; now: Date; basePath: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Election</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Voting period</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Positions</TableHead>
            <TableHead className="text-right">Voted</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((e) => (
            <TableRow key={e.id}>
              <TableCell>
                <Link href={`${basePath}/${e.id}`} className="font-medium text-navy hover:text-brand hover:underline">
                  {e.title}
                </Link>
                <p className="text-xs text-muted-foreground">{e.electionYear}</p>
              </TableCell>
              <TableCell>
                <StatusBadge status={effectiveStatus(e, now)} />
              </TableCell>
              <TableCell className="hidden text-sm md:table-cell">
                {formatDateTime(e.opensAt)}
                <br />
                <span className="text-muted-foreground">to {formatDateTime(e.closesAt)}</span>
              </TableCell>
              <TableCell className="hidden text-right tabular-nums sm:table-cell">{Number(e.positions)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {Number(e.voted)} / {Number(e.voters)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
