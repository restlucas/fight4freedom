import type { Metadata } from "next";
import { Barlow, Barlow_Condensed, Geist_Mono } from "next/font/google";
import "./globals.css";

import { TooltipProvider } from "@/components/ui/tooltip";

// BF6 UI type is proprietary (BF Body is based on the open-source Barlow), so we
// use Barlow for body/UI and Barlow Condensed for the technical, condensed
// headings/display, keeping the same design DNA.
const fontSans = Barlow({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const fontHeading = Barlow_Condensed({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const fontMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Fight4Freedom — Clã de Battlefield 6",
    template: "%s | Fight4Freedom",
  },
  description:
    "Vitrine do clã Fight4Freedom de Battlefield 6: membros, medalhas, ranking, estatísticas e melhores jogadas.",
};

/**
 * Root shell only: html, fonts and providers. The public header and footer live
 * in the (site) group, so /admin can have its own chrome instead of rendering a
 * sidebar inside the public navigation.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${fontSans.variable} ${fontHeading.variable} ${fontMono.variable} dark`}
    >
      <body className="flex min-h-dvh flex-col font-sans antialiased">
        {/* Shorter than the 700ms default: these tooltips reveal reference data
            (platform ids), so waiting feels broken. */}
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
