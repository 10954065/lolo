"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main
      id="main-content"
      className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center"
    >
      <AlertTriangle className="size-10 text-brand" aria-hidden />
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">
        The page could not be loaded. Your data is safe. Please try again; if the problem continues, contact the
        election administrator and quote the reference below.
      </p>
      {error.digest ? (
        <p className="rounded-md bg-muted px-3 py-1 font-mono text-sm">Reference: {error.digest}</p>
      ) : null}
      <div className="flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/">Go to home page</Link>
        </Button>
      </div>
    </main>
  );
}
