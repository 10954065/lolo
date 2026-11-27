"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * MOBA logo. Uses the official artwork at /brand/moba-logo.png when it is present and
 * falls back to a typographic wordmark in the crest red, so the UI never shows a broken image.
 */
const LOGO_SRC = "/brand/moba-logo.png";
/** Set at build time by next.config.ts from whether the file exists. */
const HAS_LOGO_FILE = process.env.NEXT_PUBLIC_HAS_BRAND_LOGO === "1";

type LogoState = "loading" | "loaded" | "failed";

type BrandLogoProps = {
  className?: string;
  /** "full" shows the association name; "compact" is for headers and sidebars. */
  variant?: "full" | "compact";
  /** Light text for dark backgrounds (sidebar). */
  isInverted?: boolean;
};

function Wordmark({ className, variant, isInverted }: Required<Omit<BrandLogoProps, "className">> & { className?: string }) {
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

export function BrandLogo({ className, variant = "compact", isInverted = false }: BrandLogoProps) {
  const [state, setState] = useState<LogoState>("loading");

  if (!HAS_LOGO_FILE || isInverted || state === "failed") {
    return <Wordmark className={className} variant={variant} isInverted={isInverted} />;
  }

  // The image may finish (or fail) before React hydrates, in which case onLoad/onError
  // never fire. The ref callback inspects the element once it is attached to catch that.
  const inspect = (img: HTMLImageElement | null) => {
    if (!img || !img.complete) return;
    setState(img.naturalWidth > 0 ? "loaded" : "failed");
  };

  return (
    <>
      {state === "loading" ? <Wordmark className={className} variant={variant} isInverted={false} /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- optional asset; must degrade gracefully */}
      <img
        ref={inspect}
        src={LOGO_SRC}
        alt="MOBA, Mfantsipim Old Boys Association"
        className={cn(variant === "full" ? "h-20 w-auto" : "h-10 w-auto", state === "loading" && "hidden", className)}
        onLoad={() => setState("loaded")}
        onError={() => setState("failed")}
      />
    </>
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
