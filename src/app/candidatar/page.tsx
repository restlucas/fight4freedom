import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { RecruitForm } from "@/features/recruit/components/recruit-form";

export const metadata: Metadata = {
  title: "Quero fazer parte do F4F",
  description: "Candidate-se para entrar no clã Fight4Freedom de Battlefield 6.",
};

/**
 * The public candidature page, replacing the Google Form linked from the home page.
 *
 * OUTSIDE THE `(site)` GROUP, which is what removes the header and the footer without a
 * layout of its own: those belong to `(site)/layout.tsx`, so a route that is not in that
 * group simply never gets them. Same trick `/admin` already uses. The one way back is
 * the link at the top, deliberately the only navigation on the page — a candidate
 * filling a form should have one thing to do.
 *
 * Not `force-dynamic`: nothing here reads the database or the session, so it can be
 * served from the edge cache. The form is a Client Component and posts to a Server
 * Action.
 */
export default function CandidatarPage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      {/* Same photographic background as the vitrine, so the page still feels like part
          of the site it is recruiting for. `fixed` and behind everything. */}
      <div aria-hidden className="fixed inset-0 -z-10">
        <Image
          src="/bf6-season-4.avif"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="bg-background/85 absolute inset-0" />
      </div>

      <div className="w-full max-w-lg">
        {/* Back to the site, above the card: reachable before the form and out of the
            way of it. */}
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          Voltar para o site
        </Link>

        <div className="bg-card/95 rounded-xl border p-6 shadow-lg backdrop-blur sm:p-8">
          <header className="flex flex-col items-center text-center">
            <Image
              src="/f4f-logo.avif"
              alt="Fight 4 Freedom"
              width={273}
              height={271}
              className="h-16 w-auto"
              priority
            />
            <h1 className="font-heading mt-3 text-2xl font-bold tracking-wide uppercase">
              Fight 4 Freedom
            </h1>
            {/* The Google Form's own subtitle, kept: it sets the expectation that a human
                replies, which is what actually happens. */}
            <p className="text-muted-foreground mt-2 text-sm">
              Preencha seus dados que entraremos em contato.
            </p>
          </header>

          <div className="mt-7">
            <RecruitForm />
          </div>
        </div>
      </div>
    </main>
  );
}
