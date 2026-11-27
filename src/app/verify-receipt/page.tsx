import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VerifyReceiptForm } from "./verify-receipt-form";

export const metadata: Metadata = { title: "Verify a ballot receipt" };

export default function VerifyReceiptPage() {
  return (
    <main id="main-content" className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 px-4 py-10">
      <Link href="/" className="self-center">
        <BrandLogo variant="full" />
      </Link>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl text-ink">Verify a ballot receipt</CardTitle>
          <CardDescription>
            Enter the receipt shown after you voted to confirm that your ballot is stored and will be counted. This check
            never reveals how anyone voted, and the receipt is not linked to your name.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VerifyReceiptForm />
        </CardContent>
      </Card>
    </main>
  );
}
