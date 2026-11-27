import type { Metadata } from "next";
import { PublicShell } from "@/components/layout/public-shell";

export const metadata: Metadata = { title: "About MOBA 2017" };

export default function AboutPage() {
  return (
    <PublicShell>
      <article className="max-w-3xl space-y-5">
        <h1 className="text-3xl font-bold text-ink">About MOBA 2017</h1>
        <p>
          MOBA 2017 is the 2017 year group of the Mfantsipim Old Boys Association. Members elect the year-group executives,
          such as the President, Secretaries, Treasurer and other officers, to lead the group and represent it within the
          wider association.
        </p>
        <h2 className="text-xl font-semibold text-ink">Why an online election?</h2>
        <p>
          Our members live and work across Ghana and abroad. This platform lets every approved member take part from a phone
          or computer, while protecting the integrity and secrecy of every ballot.
        </p>
        <h2 className="text-xl font-semibold text-ink">Who runs the election?</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>The System Administrator</strong> manages the member register, elections, candidates and the publication
            of results.
          </li>
          <li>
            <strong>The Electoral Committee</strong> observes and verifies the whole process with read-only access, including
            the tamper-evident audit log.
          </li>
          <li>
            <strong>Members</strong> on the voter roll cast one secret ballot during the official voting period.
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">Platform developed by Sunleon Router Enterprise.</p>
      </article>
    </PublicShell>
  );
}
