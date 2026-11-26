"use client";

import { CheckCheck, KeyRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ActionDialog } from "@/components/forms/action-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { issueCredentialsAction } from "@/server/actions/credentials";
import { approveMembersAction } from "@/server/actions/members";

export interface MemberRowView {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  membershipNumber: string | null;
  approvalStatus: string;
  accountStatus: string;
  credentialStatus: string;
  registeredAt: string;
}

type MembersTableProps = {
  rows: MemberRowView[];
  basePath: string;
  canManage: boolean;
};

function SelectedIdsFields({ ids }: { ids: string[] }) {
  return (
    <>
      {ids.map((id) => (
        <input key={id} type="hidden" name="memberId" value={id} />
      ))}
    </>
  );
}

export function MembersTable({ rows, basePath, canManage }: MembersTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const isAllSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const selectedIds = [...selected];

  function toggle(id: string, isChecked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (isChecked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      {canManage && selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-brand-soft/50 px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <ActionDialog
            action={approveMembersAction}
            triggerLabel={
              <>
                <CheckCheck className="size-4" /> Approve
              </>
            }
            title={`Approve ${selected.size} member${selected.size === 1 ? "" : "s"}?`}
            description="Approved members can be added to election voter rolls and can receive login credentials. They will be notified by email."
            confirmLabel="Approve"
            hiddenFields={{ notify: "on" }}
          >
            <SelectedIdsFields ids={selectedIds} />
          </ActionDialog>
          <ActionDialog
            action={issueCredentialsAction}
            triggerLabel={
              <>
                <KeyRound className="size-4" /> Send credentials
              </>
            }
            title="Send login credentials?"
            description="Each selected approved member without credentials receives a unique temporary password by email. Members who already have credentials are skipped."
            confirmLabel="Send credentials"
          >
            <SelectedIdsFields ids={selectedIds} />
          </ActionDialog>
          <button
            type="button"
            className="ml-auto text-muted-foreground hover:underline"
            onClick={() => setSelected(new Set())}
          >
            Clear selection
          </button>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {canManage ? (
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Select all on this page"
                    checked={isAllSelected}
                    onCheckedChange={(v) => setSelected(v ? new Set(rows.map((r) => r.id)) : new Set())}
                  />
                </TableHead>
              ) : null}
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">Membership no.</TableHead>
              <TableHead>Approval</TableHead>
              <TableHead className="hidden sm:table-cell">Account</TableHead>
              <TableHead className="hidden lg:table-cell">Credentials</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                {canManage ? (
                  <TableCell>
                    <Checkbox
                      aria-label={`Select ${r.fullName}`}
                      checked={selected.has(r.id)}
                      onCheckedChange={(v) => toggle(r.id, Boolean(v))}
                    />
                  </TableCell>
                ) : null}
                <TableCell>
                  <Link href={`${basePath}/${r.id}`} className="font-medium text-navy hover:text-brand hover:underline">
                    {r.fullName}
                  </Link>
                  <p className="text-xs text-muted-foreground">{r.email}</p>
                </TableCell>
                <TableCell className="hidden md:table-cell">{r.membershipNumber ?? "—"}</TableCell>
                <TableCell>
                  <StatusBadge status={r.approvalStatus} />
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <StatusBadge status={r.accountStatus} />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <StatusBadge status={r.credentialStatus} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
