import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { requireRolePage } from "@/server/auth/guards";

export const metadata: Metadata = { title: { default: "Administration", template: "%s · Admin · MOBA 2017" } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { session } = await requireRolePage("SYSTEM_ADMIN");
  return (
    <AppShell area="admin" userName={session.user.fullName} userEmail={session.user.email}>
      {children}
    </AppShell>
  );
}
