import type { Metadata } from "next";
import { PublicShell } from "@/components/layout/public-shell";

export const metadata: Metadata = { title: "Voting guidelines" };

const STEPS = [
  ["Check your email", "After your membership is approved you receive an email with your login email and a temporary password. Check your spam folder if you cannot find it."],
  ["Sign in and choose your password", "Sign in with the temporary password. You will be asked to choose your own password (at least 10 characters). Never share it — election officials will never ask for it."],
  ["Read about the candidates", "Open the election from your dashboard to read each candidate's biography and manifesto."],
  ["Vote while voting is open", "During the official voting period, select “Go to the ballot”. Choose one candidate for each position (or abstain where allowed)."],
  ["Review and confirm", "Review your choices, then confirm. Once submitted your ballot cannot be changed."],
  ["Keep your receipt", "You will see a receipt code once. It is not linked to your name. You can use it on the “Verify a receipt” page to confirm your ballot is counted."],
];

export default function GuidelinesPage() {
  return (
    <PublicShell>
      <article className="max-w-3xl space-y-6">
        <h1 className="text-3xl font-bold text-navy">Voting guidelines</h1>
        <ol className="space-y-4">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="flex gap-4 rounded-xl border bg-card p-4">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{i + 1}</span>
              <div>
                <h2 className="font-semibold text-navy">{title}</h2>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            </li>
          ))}
        </ol>
        <section className="space-y-2 rounded-xl border bg-card p-5">
          <h2 className="font-semibold text-navy">Your vote is secret</h2>
          <p className="text-sm text-muted-foreground">
            The platform records <em>that</em> you voted separately from <em>what</em> you chose. Ballots carry no name, email or
            time. Administrators and the Electoral Committee can see who has voted, but nobody can see how anyone voted.
          </p>
        </section>
        <section className="space-y-2 rounded-xl border bg-card p-5">
          <h2 className="font-semibold text-navy">Good practice</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Vote in private, on your own device.</li>
            <li>Do not let anyone else sign in with your account or vote for you.</li>
            <li>If your connection drops after submitting, sign in again: your dashboard shows whether your ballot was recorded.</li>
            <li>Voting times are shown in Ghana time (GMT). The server clock decides when voting opens and closes.</li>
          </ul>
        </section>
      </article>
    </PublicShell>
  );
}
