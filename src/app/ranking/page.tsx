import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ranking",
  description: "Rankings do clã Fight4Freedom.",
};

export default function RankingPage() {
  return (
    <main className="mx-auto flex min-h-[50vh] max-w-6xl flex-col items-center justify-center px-4 py-20 text-center">
      <h1 className="font-heading text-3xl font-bold">Ranking</h1>
      <p className="text-muted-foreground mt-2">Em breve.</p>
    </main>
  );
}
