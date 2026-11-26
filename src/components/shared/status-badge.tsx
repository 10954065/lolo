import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  success: "border-success/30 bg-success-soft text-success",
  warning: "border-warning/30 bg-warning-soft text-warning",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-chart-3/30 bg-chart-3/10 text-[oklch(0.42_0.1_230)]",
  brand: "border-brand/30 bg-brand-soft text-brand",
};

/** Status → [label, tone]. Unknown statuses render neutrally with a humanized label. */
const STATUS_STYLES: Record<string, [string, Tone]> = {
  // members
  PENDING: ["Pending", "warning"],
  APPROVED: ["Approved", "success"],
  REJECTED: ["Rejected", "danger"],
  ACTIVE: ["Active", "success"],
  SUSPENDED: ["Suspended", "danger"],
  DEACTIVATED: ["Deactivated", "neutral"],
  // credentials / email
  NOT_ISSUED: ["Not issued", "neutral"],
  QUEUED: ["Queued", "info"],
  SENDING: ["Sending", "info"],
  SENT: ["Sent", "info"],
  DELIVERED: ["Delivered", "success"],
  FAILED: ["Failed", "danger"],
  BOUNCED: ["Bounced", "danger"],
  COMPLAINED: ["Spam complaint", "danger"],
  ACTIVATED: ["Activated", "success"],
  // imports
  PREVIEW: ["Awaiting confirmation", "warning"],
  COMMITTED: ["Imported", "success"],
  DISCARDED: ["Discarded", "neutral"],
  // elections
  DRAFT: ["Draft", "neutral"],
  REGISTRATION: ["Registration", "info"],
  NOMINATION: ["Nomination", "info"],
  CANDIDATE_APPROVAL: ["Candidate approval", "info"],
  SCHEDULED: ["Scheduled", "warning"],
  OPEN: ["Voting open", "brand"],
  CLOSED: ["Closed", "neutral"],
  RESULTS_PUBLISHED: ["Results published", "success"],
  ARCHIVED: ["Archived", "neutral"],
  CANCELLED: ["Cancelled", "danger"],
  WITHDRAWN: ["Withdrawn", "neutral"],
};

function humanize(status: string): string {
  return status.toLowerCase().replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const [label, tone] = STATUS_STYLES[status] ?? [humanize(status), "neutral" as Tone];
  return (
    <Badge variant="outline" className={cn("font-medium", TONE_CLASSES[tone], className)}>
      {label}
    </Badge>
  );
}

export function statusLabel(status: string): string {
  return STATUS_STYLES[status]?.[0] ?? humanize(status);
}
