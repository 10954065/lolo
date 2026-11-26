import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { requireRolePage } from "@/server/auth/guards";

export const metadata: Metadata = { title: { default: "My elections", template: "%s · MOBA 2017 Elections" } };

export default async function VoterLayout({ children }: LayoutProps<"/dashboard">) {
  const { session } = await requireRolePage("VOTER");
  return (
    <AppShell area="voter" userName={session.user.fullName} userEmail={session.user.email}>
      {children}
    </AppShell>
  );
}
