import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Medalhas",
  description: "Catálogo de medalhas do clã Fight4Freedom.",
};

export default function MedalhasPage() {
  return (
    <main className="mx-auto flex min-h-[50vh] max-w-6xl flex-col items-center justify-center px-4 py-20 text-center">
      <h1 className="font-heading text-3xl font-bold">Medalhas</h1>
      <p className="text-muted-foreground mt-2">Em breve.</p>
    </main>
  );
}
