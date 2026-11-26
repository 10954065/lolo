/* eslint-disable @next/next/no-img-element -- photos are served by our own cached route */
import { cn } from "@/lib/utils";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

type CandidatePhotoProps = {
  candidateId: string;
  name: string;
  hasPhoto: boolean;
  version?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZES = { sm: "size-10 text-sm", md: "size-16 text-lg", lg: "size-28 text-3xl" };

/** Neutral, consistent candidate portrait with an initials fallback. */
export function CandidatePhoto({ candidateId, name, hasPhoto, version, size = "md", className }: CandidatePhotoProps) {
  if (hasPhoto) {
    return (
      <img
        src={`/api/candidates/${candidateId}/photo${version ? `?v=${version.slice(0, 12)}` : ""}`}
        alt={`Photograph of ${name}`}
        loading="lazy"
        className={cn("shrink-0 rounded-full border object-cover", SIZES[size], className)}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={`${name} (no photograph)`}
      className={cn("flex shrink-0 items-center justify-center rounded-full border bg-secondary font-semibold text-navy", SIZES[size], className)}
    >
      {initials(name)}
    </span>
  );
}
