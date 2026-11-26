import { ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";

export default function HomePage() {
  return (
    <main id="main-content" className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <BrandLogo variant="full" />
      <h1 className="text-3xl font-bold text-navy sm:text-4xl">MOBA 2017 Digital Election Management System</h1>
      <p className="max-w-xl text-muted-foreground">
        Secure, transparent elections for the 2017 year group of the Mfantsipim Old Boys Association.
      </p>
      <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="size-4 text-success" aria-hidden />
        Your vote is secret. Nobody — including administrators — can see how you voted.
      </p>
    </main>
  );
}
