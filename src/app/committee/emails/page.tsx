import { Mail } from "lucide-react";
import type { Metadata } from "next";
import { EmailDeliveryView } from "@/components/emails/email-delivery-view";
import { PageHeader } from "@/components/layout/page-header";
import { requirePermissionPage } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Email delivery" };

export default async function CommitteeEmailsPage({ searchParams }: PageProps<"/committee/emails">) {
  await requirePermissionPage("emails.read");
  return (
    <>
      <PageHeader
        title="Email delivery statistics"
        description="Delivery status of invitations and notifications. Message contents are never visible."
      />
      <EmailDeliveryView searchParams={await searchParams} basePath="/committee/emails" canRetry={false} icon={Mail} />
    </>
  );
}
