import { Search } from "lucide-react";
import Link from "next/link";
import { NativeSelect } from "@/components/forms/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MemberListFilters } from "@/server/validation/members";

/** Plain GET form: filters live in the URL so views are shareable and work without JS. */
export function MemberFilters({ filters, basePath }: { filters: MemberListFilters; basePath: string }) {
  return (
    <form method="get" action={basePath} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
      <div className="space-y-1.5">
        <Label htmlFor="q">Search</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input id="q" name="q" defaultValue={filters.q ?? ""} placeholder="Name, email, phone or membership no." className="pl-8" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="approval">Approval</Label>
        <NativeSelect id="approval" name="approval" defaultValue={filters.approval ?? ""}>
          <option value="">All</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="account">Account</Label>
        <NativeSelect id="account" name="account" defaultValue={filters.account ?? ""}>
          <option value="">Active &amp; suspended</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="DEACTIVATED">Deactivated</option>
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="credential">Credentials</Label>
        <NativeSelect id="credential" name="credential" defaultValue={filters.credential ?? ""}>
          <option value="">All</option>
          <option value="NOT_ISSUED">Not issued</option>
          <option value="QUEUED">Queued</option>
          <option value="SENT">Sent</option>
          <option value="DELIVERED">Delivered</option>
          <option value="FAILED">Failed</option>
          <option value="ACTIVATED">Activated</option>
        </NativeSelect>
      </div>
      <div className="flex items-end gap-2">
        <Button type="submit">Apply</Button>
        <Button variant="ghost" asChild>
          <Link href={basePath}>Reset</Link>
        </Button>
      </div>
    </form>
  );
}

export function filtersToParams(filters: MemberListFilters): Record<string, string | undefined> {
  return { q: filters.q, approval: filters.approval, account: filters.account, credential: filters.credential };
}
