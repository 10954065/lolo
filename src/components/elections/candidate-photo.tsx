"use client";

/* eslint-disable @next/next/no-img-element -- photos are served by our own cached route */
import { useState } from "react";
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

/** Neutral, consistent candidate portrait with an initials fallback (also used if the photo fails to load). */
export function CandidatePhoto({ candidateId, name, hasPhoto, version, size = "md", className }: CandidatePhotoProps) {
  const [hasFailed, setHasFailed] = useState(false);

  if (hasPhoto && !hasFailed) {
    // Catch a load failure that happened before hydration (onError would not fire).
    const inspect = (img: HTMLImageElement | null) => {
      if (img?.complete && img.naturalWidth === 0) setHasFailed(true);
    };
    return (
      <img
        ref={inspect}
        src={`/api/candidates/${candidateId}/photo${version ? `?v=${version.slice(0, 12)}` : ""}`}
        alt={`Photograph of ${name}`}
        loading="lazy"
        onError={() => setHasFailed(true)}
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
