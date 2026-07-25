import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DiscordLoginButton } from "@/features/auth/components/discord-login-button";
import { getSessionProfile } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Entrar",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Deliberately vague on failure: "sem_convite" must not reveal whether a Discord
 * account exists in the roster, or the page becomes a membership oracle.
 */
const ERRORS: Record<string, string> = {
  sem_convite:
    "Sua conta do Discord não está vinculada a nenhum membro do clã. Peça um convite a um oficial.",
  falha: "Não foi possível concluir o login. Tente novamente.",
  sem_codigo: "O login foi interrompido antes de terminar. Tente novamente.",
  restrito: "Você precisa entrar para acessar essa área.",
  admin: "Essa área é restrita a administradores.",
};

type Props = { searchParams: Promise<{ erro?: string; next?: string }> };

export default async function EntrarPage({ searchParams }: Props) {
  const { erro, next } = await searchParams;
  const profile = await getSessionProfile();

  // Already in: nothing to do here.
  if (profile) redirect(next?.startsWith("/") ? next : "/");

  const message = erro ? ERRORS[erro] : null;

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center px-4 py-16">
      <div className="bg-card rounded-xl border p-8 text-center">
        <h1 className="font-heading text-2xl font-bold">Entrar</h1>
        <p className="text-muted-foreground mt-3 text-sm">
          O acesso é exclusivo para membros do clã, com a conta do Discord já
          vinculada.
        </p>

        {message ? (
          <p
            role="alert"
            className="border-destructive/40 bg-destructive/10 mt-6 rounded-md border p-3 text-sm"
          >
            {message}
          </p>
        ) : null}

        <div className="mt-6 flex justify-center">
          <DiscordLoginButton next={next?.startsWith("/") ? next : "/"} />
        </div>
      </div>
    </main>
  );
}
