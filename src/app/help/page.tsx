import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/layout/public-shell";
import { getSettings } from "@/server/services/settings";

export const metadata: Metadata = { title: "Help and support" };

const FAQ = [
  ["I did not receive my login email.", "Check your spam or junk folder. If it is not there, contact the election administrator, who can re-send it or issue new login details."],
  ["My temporary password has expired.", "Temporary passwords are valid for a limited number of days. Ask the administrator to send new login details."],
  ["I forgot my password.", "Use “Forgot your password?” on the sign-in page. A reset link valid for 30 minutes will be emailed to you."],
  ["My account is locked.", "After several wrong passwords the account locks for a short time. Wait and try again, or reset your password."],
  ["I submitted my vote but my connection dropped.", "Sign in again. Your dashboard shows whether your ballot was recorded. You cannot vote twice."],
  ["Can I change my vote?", "No. Once submitted, a ballot is final."],
  ["Can anyone see who I voted for?", "No. Your choices are stored without your name, and the system cannot link them back to you."],
];

export default async function HelpPage() {
  const settings = await getSettings();
  return (
    <PublicShell>
      <article className="max-w-3xl space-y-6">
        <h1 className="text-3xl font-bold text-navy">Help and support</h1>
        <dl className="space-y-4">
          {FAQ.map(([q, a]) => (
            <div key={q} className="rounded-xl border bg-card p-4">
              <dt className="font-semibold text-navy">{q}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{a}</dd>
            </div>
          ))}
        </dl>
        <section className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold text-navy">Contact</h2>
          {settings.supportEmail || settings.supportPhone ? (
            <ul className="mt-2 space-y-1 text-sm">
              {settings.supportEmail ? (
                <li>
                  Email:{" "}
                  <a className="font-medium text-brand hover:underline" href={`mailto:${settings.supportEmail}`}>
                    {settings.supportEmail}
                  </a>
                </li>
              ) : null}
              {settings.supportPhone ? <li>Phone: {settings.supportPhone}</li> : null}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Contact the MOBA 2017 election administrator through the year-group executives.</p>
          )}
          <p className="mt-3 text-sm">
            <Link href="/guidelines" className="font-medium text-brand hover:underline">
              Read the voting guidelines
            </Link>
          </p>
        </section>
      </article>
    </PublicShell>
  );
}
