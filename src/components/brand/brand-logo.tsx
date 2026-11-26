"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * MOBA logo. Uses the official artwork at /brand/moba-logo.png when it is present and
 * falls back to a typographic wordmark in the crest red, so the UI never shows a broken image.
 */
const LOGO_SRC = "/brand/moba-logo.png";

type BrandLogoProps = {
  className?: string;
  /** "full" shows the association name; "compact" is for headers and sidebars. */
  variant?: "full" | "compact";
  /** Light text for dark backgrounds (sidebar). */
  isInverted?: boolean;
};

export function BrandLogo({ className, variant = "compact", isInverted = false }: BrandLogoProps) {
  const [hasImageFailed, setHasImageFailed] = useState(false);

  if (!hasImageFailed && !isInverted) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- optional asset; must degrade gracefully
      <img
        src={LOGO_SRC}
        alt="MOBA — Mfantsipim Old Boys Association"
        className={cn(variant === "full" ? "h-20 w-auto" : "h-10 w-auto", className)}
        onError={() => setHasImageFailed(true)}
      />
    );
  }

  return (
    <span className={cn("inline-flex flex-col leading-none", className)} aria-label="MOBA 2017">
      <span
        className={cn(
          "font-extrabold tracking-tight",
          variant === "full" ? "text-5xl" : "text-2xl",
          isInverted ? "text-white" : "text-brand",
        )}
      >
        MOBA
      </span>
      {variant === "full" ? (
        <span className={cn("mt-1 text-sm font-medium", isInverted ? "text-white/80" : "text-navy")}>
          Mfantsipim Old Boys Association
        </span>
      ) : null}
    </span>
  );
}

export function BrandLockup({ isInverted = false }: { isInverted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3">
      <BrandLogo isInverted={isInverted} />
      <span className="flex flex-col leading-tight">
        <span className={cn("text-sm font-semibold", isInverted ? "text-white" : "text-navy")}>MOBA 2017</span>
        <span className={cn("text-xs", isInverted ? "text-white/70" : "text-muted-foreground")}>
          Election Management System
        </span>
      </span>
    </span>
  );
}
