import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main-content" className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand">404</p>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">
        The page you are looking for does not exist, or you do not have access to it.
      </p>
      <Button asChild>
        <Link href="/">Go to home page</Link>
      </Button>
    </main>
  );
}
