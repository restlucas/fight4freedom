import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[50vh] max-w-5xl flex-col items-center justify-center px-4 py-20 text-center">
      <h1 className="font-heading text-3xl font-bold">Membro não encontrado</h1>
      <p className="text-muted-foreground mt-2">
        Esse jogador não existe ou saiu do esquadrão.
      </p>
      <Link
        href="/membros"
        className="text-primary mt-6 inline-block hover:underline"
      >
        Voltar para Membros
      </Link>
    </main>
  );
}
