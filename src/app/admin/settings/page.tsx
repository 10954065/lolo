import { Database, ShieldCheck, ShieldX } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermissionPage } from "@/server/auth/guards";
import { databaseHardeningStatus } from "@/server/services/system-health";
import { getSettings } from "@/server/services/settings";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePermissionPage("settings.write");
  const [settings, hardening] = await Promise.all([getSettings(), databaseHardeningStatus()]);

  return (
    <>
      <PageHeader title="System settings" description="Changes are recorded in the audit log with old and new values." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardContent className="pt-6">
            <SettingsForm values={settings} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="size-5 text-brand" aria-hidden /> Database protection
            </CardTitle>
            <CardDescription>Checks the privileges of the database role the application runs as.</CardDescription>
          </CardHeader>
          <CardContent>
            {hardening.isHardened ? (
              <p className="flex items-start gap-2 text-sm text-success">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                Hardened: the application role ({hardening.role}) cannot read individual ballots and cannot alter the audit
                log.
              </p>
            ) : (
              <p className="flex items-start gap-2 text-sm text-destructive">
                <ShieldX className="mt-0.5 size-4 shrink-0" aria-hidden />
                Not hardened: the application is connected as “{hardening.role}”, which can read ballot rows. Run
                {" "}<code>npm run db:harden</code> and connect as <code>moba_app</code> before any live election.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
