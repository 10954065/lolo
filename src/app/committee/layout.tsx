import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { requireRolePage } from "@/server/auth/guards";

export const metadata: Metadata = {
  title: { default: "Electoral Committee", template: "%s · Electoral Committee · MOBA 2017" },
};

export default async function CommitteeLayout({ children }: LayoutProps<"/committee">) {
  const { session } = await requireRolePage("ELECTORAL_COMMITTEE");
  return (
    <AppShell area="committee" userName={session.user.fullName} userEmail={session.user.email}>
      {children}
    </AppShell>
  );
}
