import { CandidatePhoto } from "@/components/elections/candidate-photo";
import { PlainText } from "@/components/elections/election-summary";

type CandidateProfileProps = {
  candidate: { id: string; fullName: string; biography: string; manifesto: string; hasPhoto: boolean; photoVersion: string | null };
  positionTitle?: string;
};

/** Neutral, identical presentation for every candidate (same layout, no ordering emphasis). */
export function CandidateProfile({ candidate: c, positionTitle }: CandidateProfileProps) {
  return (
    <article className="flex gap-4 rounded-xl border bg-card p-4">
      <CandidatePhoto candidateId={c.id} name={c.fullName} hasPhoto={c.hasPhoto} version={c.photoVersion} size="md" />
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <h3 className="font-semibold text-navy">{c.fullName}</h3>
          {positionTitle ? <p className="text-xs text-muted-foreground">Candidate for {positionTitle}</p> : null}
        </div>
        {c.biography ? <PlainText text={c.biography} className="text-sm text-muted-foreground" /> : null}
        {c.manifesto ? (
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-brand">Read manifesto</summary>
            <PlainText text={c.manifesto} className="mt-2" />
          </details>
        ) : null}
      </div>
    </article>
  );
}
