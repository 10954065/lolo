import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import { headers } from "next/headers";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const serifDisplay = Source_Serif_4({ variable: "--font-serif-display", subsets: ["latin"], weight: ["600", "700"] });

export const metadata: Metadata = {
  title: {
    default: "MOBA 2017 Elections",
    template: "%s · MOBA 2017 Elections",
  },
  description:
    "The official digital election platform of MOBA 2017, the 2017 year group of the Mfantsipim Old Boys Association.",
  applicationName: "MOBA 2017 Elections",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#B5171E",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reading request headers makes every route dynamic, which the per-request CSP nonce
  // (set in src/proxy.ts) requires: Next.js applies the nonce to its own scripts.
  await headers();

  return (
    <html lang="en-GH" className={`${geistSans.variable} ${geistMono.variable} ${serifDisplay.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow"
        >
          Skip to main content
        </a>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
