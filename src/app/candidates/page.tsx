import type { Metadata } from "next";
import { PublicShell } from "@/components/layout/public-shell";
import { CandidateProfile } from "@/components/voting/candidate-profile";
import { publicCandidates } from "@/server/services/public";

export const metadata: Metadata = { title: "Candidate directory" };

export default async function CandidateDirectoryPage() {
  const rows = await publicCandidates();
  const elections = [...new Map(rows.map((r) => [r.electionId, r.electionTitle])).entries()];
  return (
    <PublicShell>
      <h1 className="text-3xl font-bold text-navy">Candidate directory</h1>
      <p className="mt-2 text-muted-foreground">
        Approved candidates appear here once an election&apos;s ballot is final. Every candidate is presented the same way.
      </p>
      {elections.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          No candidate list has been finalised yet.
        </p>
      ) : (
        elections.map(([electionId, title]) => {
          const inElection = rows.filter((r) => r.electionId === electionId);
          const positions = [...new Set(inElection.map((r) => r.positionTitle))];
          return (
            <section key={electionId} className="mt-10 space-y-6">
              <h2 className="text-2xl font-semibold text-navy">{title}</h2>
              {positions.map((p) => (
                <div key={p} className="space-y-3">
                  <h3 className="font-semibold text-brand">{p}</h3>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {inElection
                      .filter((r) => r.positionTitle === p)
                      .map((c) => (
                        <CandidateProfile key={c.id} candidate={c} />
                      ))}
                  </div>
                </div>
              ))}
            </section>
          );
        })
      )}
    </PublicShell>
  );
}
