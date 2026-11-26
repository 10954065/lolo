import { Mail } from "lucide-react";
import type { Metadata } from "next";
import { EmailDeliveryView } from "@/components/emails/email-delivery-view";
import { PageHeader } from "@/components/layout/page-header";
import { requirePermissionPage } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Email delivery" };

export default async function AdminEmailsPage({ searchParams }: PageProps<"/admin/emails">) {
  await requirePermissionPage("emails.write");
  return (
    <>
      <PageHeader
        title="Email delivery"
        description="Delivery status of every email sent by the platform. Message contents (including passwords) are never stored in readable form."
      />
      <EmailDeliveryView searchParams={await searchParams} basePath="/admin/emails" canRetry icon={Mail} />
    </>
  );
}
