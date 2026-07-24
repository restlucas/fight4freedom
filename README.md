# Fight4Freedom

Vitrine web do clã **Fight4Freedom** de Battlefield 6: página inicial convidativa, listagem de
membros, catálogo de medalhas do clã, ranking/estatísticas e melhores jogadas (vídeos). Inclui um
painel administrativo para cadastrar membros, criar/atribuir medalhas, editar stats e subir vídeos.

Stats dos membros seguem um modelo **híbrido**: um worker de scraping do tracker.gg alimenta os
dados automaticamente (de hora em hora) e os admins podem editar/sobrescrever manualmente pelo
painel. Toda a origem de dados fica atrás de uma interface `StatsProvider`, permitindo trocar de
fonte sem reescrever o app.

Projeto criado a partir do template [`nextjs-starter`](https://github.com/restlucas/nextjs-starter).

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript** (strict)
- **Tailwind CSS v4** + **shadcn/ui** (base color `neutral`, style `new-york`)
- **Supabase** (Postgres + Auth Discord + Storage) — _adicionado por fase_
- **Drizzle ORM** (`pnpm db:push`) — _adicionado por fase_
- **ESLint** (flat config) + **Prettier**
- **Vitest** + Testing Library (unit) e **Playwright** (E2E)
- **GitHub Actions**: lint → type-check → test → build (+ E2E)
- Gerenciador: **pnpm**

## Getting started

```bash
pnpm install
cp .env.example .env.local   # preencher as variáveis
pnpm dev
```

## Scripts

| Comando             | O que faz                                    |
| ------------------- | -------------------------------------------- |
| `pnpm dev`          | Servidor de desenvolvimento                  |
| `pnpm build`        | Build de produção                            |
| `pnpm start`        | Roda o build de produção                     |
| `pnpm lint`         | ESLint                                       |
| `pnpm type-check`   | `tsc --noEmit`                               |
| `pnpm format`       | Formata com Prettier                         |
| `pnpm test`         | Testes unitários (Vitest)                    |
| `pnpm test:e2e`     | Testes E2E (Playwright)                      |

## Estrutura

```
src/
  app/            # rotas + layout + globals.css + error/loading/not-found
  components/     # UI compartilhada e genérica (ui/ é populada pelo shadcn)
  features/       # módulos de domínio, criados sob demanda (ver CLAUDE.md)
  lib/            # utilitários (cn, helpers, db, stats)
tests/
  e2e/            # specs do Playwright
```

Testes unitários ficam colocados ao lado do arquivo testado (`page.tsx` -> `page.test.tsx`).
As convenções de arquitetura estão documentadas nos arquivos `CLAUDE.md` de cada pasta.

## Fases

- **Fase 0** — Fundação: template, branding, env, Supabase + Drizzle, schema, seed.
- **Fase 1** — Vitrine pública (home, membros, medalhas, ranking, melhores jogadas) com dados semeados.
- **Fase 2** — Auth (Discord) + painel administrativo.
- **Fase 3** — Worker de scraping do tracker.gg (hora em hora) no Railway/Fly.
- **Fase 4** — Progressão (gráficos), membro do mês e polimento.
