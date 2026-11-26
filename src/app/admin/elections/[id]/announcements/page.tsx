import { Megaphone, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";
import { PlainText } from "@/components/elections/election-summary";
import { ActionDialog } from "@/components/forms/action-dialog";
import { TextField } from "@/components/forms/form-parts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDateTime } from "@/lib/datetime";
import { createAnnouncementAction, deleteAnnouncementAction } from "@/server/actions/elections";
import { requirePermissionPage } from "@/server/auth/guards";
import { listAnnouncements } from "@/server/services/announcements";
import { getElection } from "@/server/services/elections";

export default async function AnnouncementsPage({ params }: PageProps<"/admin/elections/[id]/announcements">) {
  await requirePermissionPage("announcements.write");
  const { id } = await params;
  const election = await getElection(id);
  if (!election) notFound();
  const rows = await listAnnouncements(id);

  return (
    <div className="space-y-4">
      <ActionDialog
        action={createAnnouncementAction.bind(null, id)}
        triggerVariant="default"
        triggerSize="default"
        triggerLabel={<><Megaphone className="size-4" /> New announcement</>}
        title="Publish an announcement"
        description="Visible on the dashboard of every member on this election's voter roll."
        confirmLabel="Publish"
      >
        <TextField name="title" label="Title" required maxLength={150} />
        <TextField name="body" label="Message" isMultiline rows={6} required maxLength={5000} />
        <label className="flex items-start gap-3 text-sm">
          <Checkbox name="email" className="mt-0.5" />
          <span className="font-medium">Also email it to every member on the voter roll</span>
        </label>
      </ActionDialog>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">No announcements yet.</p>
      ) : (
        rows.map(({ announcement: a }) => (
          <Card key={a.id}>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">{a.title}</CardTitle>
                <p className="text-xs text-muted-foreground">{formatDateTime(a.publishedAt)}</p>
              </div>
              <ActionDialog
                action={deleteAnnouncementAction.bind(null, id, a.id)}
                triggerVariant="ghost"
                triggerLabel={<Trash2 className="size-4" aria-label="Remove announcement" />}
                title="Remove this announcement?"
                confirmLabel="Remove"
                isDestructive
              />
            </CardHeader>
            <CardContent>
              <PlainText text={a.body} className="text-sm" />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
