# Fight4Freedom v2 — Vitrine do clã de Battlefield 6

## Contexto

O clã tem hoje o site `fight4freedom.com.br` (v1). A v2 é uma reconstrução como plataforma
que valoriza o esforço de cada membro: uma **vitrine pública** (home convidativa, membros,
medalhas do clã e ranking/stats) mais um **painel administrativo** para cadastrar membros,
criar medalhas e atribuí-las.

Tentativas anteriores de usar APIs para stats traziam dados desatualizados. A decisão é uma
estratégia **híbrida**: um scraper do `tracker.gg` reduz o trabalho manual, mas admins sempre
podem editar/sobrescrever pelo painel. Toda a origem de dados fica atrás de uma interface
`StatsProvider`, então trocar de fonte (scraper ↔ manual ↔ API futura) não reescreve o app.

Base do projeto: o template `nextjs-starter` (Next 16 App Router + React 19 + TS strict +
Tailwind v4 + shadcn configurado, CI já pronto). App **única** (não monorepo).

### Decisões firmadas com o usuário
- **Fonte de dados:** híbrido — scraper (tracker.gg) automatizado + edição manual, atrás de `StatsProvider`.
- **MVP (Fase 1):** vitrine pública com dados semeados manualmente. Admin e scraper vêm depois.
- **Auth admin:** Discord + Google OAuth (via Supabase Auth).
- **Scraping:** todos os membros a cada 1h, via worker dedicado (Railway/Fly).
- Sem pressão de prazo; entregue em fases ("o que der pra fazer").

### Riscos assumidos (scraping do tracker.gg)
- tracker.gg usa Cloudflare + antibot agressivo → scraping é **frágil** e exige manutenção.
- O ToS deles normalmente **proíbe** acesso automatizado. Por isso o scraper fica isolado,
  com edição manual sempre disponível como rede de segurança, e roda fora do runtime da app web.

---

## Status (atualizado em 2026-07-24)

**Fase 0 em andamento.** Concluído:
- [x] Projeto criado em `C:\dev\fight4freedom` a partir do template `nextjs-starter` (git clone).
- [x] Git reiniciado do zero (branch `main`, sem remote — desvinculado do template).
- [x] Identidade ajustada: `package.json` (nome `fight4freedom`), `layout.tsx` (metadata do clã),
      `page.tsx` (home provisória), `README.md`, `.env.example` (vars do Supabase comentadas).
- [x] Testes atualizados (`page.test.tsx`, `home.spec.ts`) para o novo título.
- [x] `pnpm install` + baseline verde: type-check, lint, test e build.

Concluído (continuação):
- [x] `src/lib/env.ts` (ponto único de leitura; getters lazy para vars server-only).
- [x] Supabase + **Prisma 7**: `prisma/schema.prisma` (member, medal, memberMedal, statSnapshot,
      highlight, profile + enums), `prisma.config.ts` (URLs fora do schema — mudança do Prisma 7),
      `src/lib/db/index.ts` (client singleton com driver adapter `@prisma/adapter-pg` no pooler),
      scripts `db:push`/`db:generate`/`db:studio`/`db:seed` (via `dotenv-cli` p/ ler `.env.local`).
      Dependências: `@prisma/client`, `@prisma/adapter-pg`, `prisma`, `tsx`, `dotenv-cli`.
      **Nota:** começamos com Drizzle, mas o `drizzle-kit push` tem um bug de introspecção contra o
      Postgres 17 do Supabase (lê CHECKs dos schemas `auth`/`realtime` e quebra). Trocamos por Prisma.
- [x] Duas URLs no `.env.local`: `DATABASE_URL` (pooler 6543 + `pgbouncer=true`, runtime) e
      `DIRECT_URL` (session pooler 5432, usado pelo `db push`). `pnpm db:push` aplicou as tabelas.
- [x] `src/lib/db/seed.ts` (Prisma) com 1 membro real (RRRRRRRREST, admin) + 6 de EXEMPLO,
      4 medalhas, 6 atribuições, 21 snapshots em 3 datas (ranking "mês" vs "geral"), 3 highlights.
- [x] Branding BF6 em `src/app/globals.css` (paleta azul `#0084C9` + superfícies `#242B2F`/`#2F383E`,
      dark por padrão, light pronto) e fontes Barlow + Barlow Condensed em `layout.tsx`.
- [x] Baseline verde após as mudanças: type-check, lint e build.

Pendente na Fase 0:
- [ ] Substituir o roster de exemplo do seed pela lista real de membros do `fight4freedom.com.br`.
- [ ] Atualizar o CI (`.github/workflows/ci.yml`) para o fluxo do Prisma (`prisma generate` roda no
      `postinstall`; conferir se precisa de `DATABASE_URL`/`DIRECT_URL` como secrets quando a Fase 1
      passar a ler o banco no build).
- [ ] (Quando quiser) repo remoto `restlucas/fight4freedom` + commit inicial.

---

## Stack a adicionar sobre o nextjs-starter

Instalar por projeto (o starter não traz nada disso):
- **Supabase**: Postgres + Auth (Discord + Google OAuth) + **Storage** (vídeos de melhores jogadas).
- **Prisma 7** (`@prisma/client` + `@prisma/adapter-pg` + `prisma`): schema em
  `prisma/schema.prisma`, aplicado com `pnpm db:push` (schema-first, sem histórico de migrations).
  URLs no `prisma.config.ts`; client com driver adapter em `src/lib/db/index.ts`.
- **Zod** + `react-hook-form` + `@hookform/resolvers` (forms do painel admin — Fase 2).
- **Recharts** (gráficos de progressão de stats — Fase 3/4).
- **shadcn/ui**: adicionar primitivos conforme necessidade via a skill `add-shadcn-component`
  (`card`, `table`, `avatar`, `badge`, `dialog`, `dropdown-menu`, `form`, `input`, `select`,
  `tabs`, `tooltip`, `sonner`). Nenhum instalado ainda.
- **Playwright** já vem no starter (E2E); reutilizado pelo scraper (Fase 3) num script isolado.
- **date-fns** para cálculos de "este mês" nos rankings.

Data fetching: **Server Components + Server Actions** por padrão (a vitrine é read-only).
TanStack Query só se algum trecho do painel exigir interatividade cliente pesada — não assumir upfront.

---

## Modelo de dados — `prisma/schema.prisma` (Prisma, `pnpm db:push`)

- **`member`**: `id` (uuid text PK), `nickname` (gamertag exibido), `platform`
  (`ea | xbox | psn`), `trackerHandle` (identificador/URL usado no scraping, nullable),
  `discordId` (nullable), `avatarUrl` (nullable), `role` (`member | officer | admin` — cargo no clã,
  só exibição; acesso de sistema é o `profile.isAdmin`),
  `joinedAt` (date), `active` (bool default true), `createdAt`, `updatedAt`.
- **`medal`**: `id`, `name`, `description`, `criteria` (texto, ex.: "20 kills sem morrer"),
  `icon` (nome de ícone lucide ou `imageUrl`), `tier` (`bronze | silver | gold | legendary`,
  para estilizar), `createdAt`, `createdBy` (nullable até a Fase 2).
- **`memberMedal`** (junção): `id`, `memberId` (FK cascade), `medalId` (FK cascade),
  `awardedAt`, `awardedBy` (nullable), `note` (nullable). Índice único `(memberId, medalId)`.
- **`statSnapshot`** (série temporal — o diferencial vs. site atual): `id`, `memberId`
  (FK cascade), `capturedAt` (timestamp), `source` (`scraper | manual | api`),
  colunas de stats BF6: `kills`, `deaths`, `matchesPlayed`, `wins`, `score`,
  `timePlayedMinutes` (todos int), `extra` (jsonb, para métricas extras sem migração).
  K/D e win-rate são **derivados** (não armazenados). "Este mês" = último snapshot menos o
  snapshot mais antigo do mês (via `date-fns`).
- **`highlight`** (melhores jogadas): `id`, `title`, `description` (nullable),
  `memberId` (FK, nullable — de quem é a jogada), `videoPath` (caminho no bucket Storage),
  `thumbnailPath` (nullable), `durationSeconds` (int, validado ≤ 60), `playedAt` (date — base
  para filtrar por semana/mês), `featured` (bool default false), `createdBy`, `createdAt`.
- **`profile`** (Fase 2): mapeia usuário autenticado (Supabase `auth.users.id`) → papel de
  sistema `isAdmin` (bool) e opcional `memberId`. Controla quem acessa o painel.

Ranking é **calculado em query/RSC**, não persistido (ex.: mais partidas no mês, melhor K/D,
maior score do mês), a partir de `statSnapshot`.

---

## Camada de dados de stats — `src/lib/stats/`

Isola a origem para permitir troca sem tocar no app:
- `provider.ts`: interface `StatsProvider { fetchMemberStats(handle): Promise<RawStats> }` e
  o tipo `RawStats` (kills, deaths, matchesPlayed, wins, score, timePlayedMinutes, extra).
- `manual-provider.ts`: implementação trivial (não busca nada externo; snapshots vêm do painel).
- `tracker-scraper-provider.ts` (Fase 3): implementação Playwright contra o tracker.gg,
  **usada só pelo script de scraping**, nunca importada no bundle da web app.
- `snapshots.ts`: funções **puras** e testáveis — `computeKd`, `computeWinRate`,
  `deltaForMonth(snapshots, month)`, `rankMembers(...)` — com testes colocados (`*.test.ts`).

---

## Fases

### Fase 0 — Fundação (sem depender do scraper nem da chave de nada)
1. Clonar o starter como `fight4freedom` (padrão do usuário) ou criar a pasta a partir dele.
2. Renomear metadata/título placeholder em `src/app/layout.tsx` (tem TODO) para a marca do clã;
   ajustar branding/tema (cores do clã) em `src/app/globals.css`.
3. Centralizar env em `src/lib/env.ts` (o CLAUDE.md pede um único ponto de leitura; ainda não existe):
   `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, chaves Supabase.
4. Adicionar Supabase + Prisma; criar `prisma/schema.prisma`, `prisma.config.ts` e
   `src/lib/db/index.ts` (client), scripts `db:push`/`db:generate` no `package.json`. Rodar `pnpm db:push`.
5. Criar `src/lib/db/seed.ts` com membros/medalhas/atribuições e alguns `statSnapshot` de exemplo
   (dá conteúdo real para a vitrine da Fase 1). Migrar manualmente a lista de membros do site atual.

### Fase 1 — MVP: Vitrine pública (dados semeados) — *entrega apresentável*
Rotas via skill `create-route`; UI com componentes shadcn + custom via `create-component`.
- `/` — **home convidativa**: hero com CTA "Junte-se ao clã" (link Discord), destaques
  (nº de membros, medalhas concedidas, top do mês), identidade visual do clã.
- `/membros` — **listagem de membros**: cards/tabela com avatar, nick, plataforma, cargo,
  medalhas em destaque. Link para perfil individual.
- `/membros/[id]` — perfil: stats atuais (do último snapshot), medalhas, mini-gráfico de progressão.
- `/medalhas` — **catálogo de medalhas** do clã: nome, critério, tier, quem já conquistou.
- `/ranking` — **rankings**: mais partidas no mês, melhor K/D, maior score, mais medalhas.
  Toggle "mês atual" vs "geral". Calculado a partir de `statSnapshot`.
- `/melhores-jogadas` — **highlights em vídeo**: grade de clipes curtos (≤ 1 min) com player,
  título, autor (membro) e data. Filtro **por semana / por mês** (deriva de `playedAt` com
  `date-fns`). Vídeo servido do Supabase Storage; destaque para os `featured`. Na Fase 1
  populado pelo seed; upload real chega na Fase 2.
- Componentes reutilizáveis (`src/components/` ou `src/features/clan/`): `MemberCard`,
  `MedalBadge`, `StatTile`, `RankingTable`. Escalar para `src/features/<domínio>/` quando um
  domínio passar de 3 arquivos (regra do starter).
- Testes: unit (Vitest) na lógica de ranking/derivados; E2E (Playwright) navegando as 6 páginas.

### Fase 2 — Auth + Painel administrativo
- Supabase Auth com **Discord + Google OAuth**; `middleware.ts` protegendo `/admin`;
  tabela `profile` + guard `requireAdmin()` (análogo ao `requireUserId()` do Routina).
- `/admin` (dashboard) e sub-rotas:
  - Cadastrar/editar membros (form Zod + react-hook-form).
  - Criar/editar medalhas.
  - Atribuir/remover medalhas a membros.
  - Editar stats manualmente (cria `statSnapshot` com `source: manual`) — a parte "manual" do híbrido.
  - **Upload de melhores jogadas:** enviar vídeo (≤ 1 min) para o bucket `highlights` do
    Supabase Storage e criar o registro `highlight` (título, membro, `playedAt`, `featured`).
    Validar duração e tamanho no cliente e no servidor; opcional gerar thumbnail.
- Server Actions em `src/server/actions/` (`member.ts`, `medal.ts`, `stats.ts`, `highlight.ts`)
  com `requireAdmin()` + `revalidatePath`. UI otimista com `sonner` (padrão do Routina).

### Fase 3 — Scraper do tracker.gg (a parte "automática" do híbrido) — de hora em hora, todos os membros
- **Serviço dedicado (worker), não GitHub Actions.** Cadência fixa horária de *todos* os membros
  exige um processo confiável e de custo previsível (o cron do Actions é impreciso e, em repo
  privado, estoura os minutos grátis). Fica **no mesmo repo**, em `scraper/` (com `package.json`
  e `Dockerfile` próprios), deployado separadamente no **Railway** (ou Fly) — fora do runtime web
  da Vercel, que não roda Chromium.
- `TrackerScraperProvider` (Playwright) implementa `StatsProvider`; o código do scraper **nunca
  entra no bundle** da app web (isolado pela interface).
- **Agendador interno** (node-cron / loop) dispara a cada 1h: lê os membros ativos com
  `trackerHandle` no Supabase, scrapa cada um com **espaçamento + jitter** e concorrência limitada
  (reduz risco de bloqueio) e faz upsert de `statSnapshot` (`source: scraper`).
- Resiliência: falha de um handle é pulada e logada, não derruba os demais; nunca sobrescreve
  edição manual mais recente (respeitar `source`/`capturedAt`); retry/backoff em erro transitório.
- **Sinal de "jogou" + dedup:** ler o **timestamp da última partida** (ou a contagem total de
  partidas) do perfil como marcador. Se não mudou desde o último snapshot → não jogou → não grava
  linha nova (o check ainda é 1 request; ele economiza escrita/parsing, não requests). Mesmo assim,
  ~30 membros × 24h × 30d ≈ 21 mil linhas/mês no pior caso — o Postgres aguenta.
- **Controle de volume/bloqueio:** espalhar as coletas ao longo dos 60 min + jitter. Otimização
  futura opcional: **cadência adaptativa** (jogou recentemente → 1h; inativo há dias → 6h), usando
  o mesmo sinal de última partida; isso sim corta requests. Começar simples: todos a cada 1h.

### Fase 4 — Progressão e polimento
- Gráficos de progressão (Recharts) no perfil e no ranking (série temporal de `statSnapshot`).
- "Membro do mês", conquistas automáticas sugeridas a partir de deltas, refino visual/animações.

---

## Deploy
- **App:** Vercel. **DB/Auth/Storage:** Supabase. **Scraper:** worker dedicado no Railway/Fly
  (Docker + Playwright + cron interno horário), na pasta `scraper/` do mesmo repo (Fase 3).
- CI do starter já roda lint → type-check → test → build + E2E; manter e rodar antes de commitar.

## Verificação
- **Fase 0:** `pnpm db:push` cria as tabelas; `seed` popula; `pnpm dev` sobe; type-check/lint/build verdes.
- **Fase 1:** as 6 rotas renderizam com dados do seed; ranking "mês" vs "geral" bate com os snapshots;
  `/melhores-jogadas` filtra por semana/mês e toca o vídeo; testes puros de ranking/filtro passam;
  E2E navega as páginas; visual conferido em light/dark.
- **Fase 2:** login Discord e Google funciona; `/admin` bloqueado para não-admin; CRUD de membro/medalha
  e atribuição persistem e refletem na vitrine; edição manual de stats gera snapshot `source: manual`;
  upload de vídeo (≤ 1 min) grava no Storage, cria o `highlight` e aparece em `/melhores-jogadas`.
- **Fase 3:** rodar o script local contra 1 handle real insere snapshot correto; cron agenda; falha de
  um handle não derruba os demais; edição manual não é sobrescrita.

## Observações
- Medalhas são **curadas e atribuídas por admins** (critérios como "20 kills sem morrer" não são
  detectáveis via scraping) — o scraper alimenta só stats numéricas; medalhas são manuais por design.
- Reaproveitar padrões do Routina: `requireUserId`/`requireAdmin` + `revalidatePath` nas actions,
  otimista com rollback + `toast`, lógica pura testável em `src/lib/*`, alias `@/*`, RSC por padrão.
- Ação pendente do usuário (não bloqueia Fases 0–2): confirmar viabilidade/estabilidade do scraping
  do BF6 no tracker.gg antes de investir na Fase 3.
- **Spike obrigatório antes de construir o worker (Fase 3):** validar num perfil real se o tracker.gg
  (a) expõe "última partida"/total de partidas, (b) atualiza os dados sozinho ou só quando o perfil
  é aberto/"refreshado" — se for o caso (b), scraping de hora em hora pode continuar mostrando dado
  velho (provável causa do problema original com a API); verificar se abrir a página via Playwright
  já dispara o refresh — e (c) se há um endpoint JSON mais leve por baixo da página.
