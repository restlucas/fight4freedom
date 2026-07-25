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
- **Fonte de dados:** stats vêm **só do scraper** (tracker.gg), atrás de `StatsProvider`.
  A tela de edição manual foi descartada (2026-07-25): manter 6 campos × ~30 membros à mão não se
  sustenta. O valor `manual` do enum `StatSource` e a interface `StatsProvider` **continuam no
  schema** — custam zero e deixam a porta aberta se o spike da Fase 3 mostrar que o scraping não
  é viável. Ver Backlog.
- **MVP (Fase 1):** vitrine pública com dados semeados manualmente. Admin e scraper vêm depois.
- **Auth admin:** Discord OAuth (via Supabase Auth).
- **Scraping:** todos os membros a cada 1h, via worker dedicado (Railway/Fly).
- **Melhores jogadas (vitrine + upload):** movido para o Backlog (2026-07-25), sem fase definida.
- Sem pressão de prazo; entregue em fases ("o que der pra fazer").

### Riscos assumidos (scraping do tracker.gg)
- tracker.gg usa Cloudflare + antibot agressivo → scraping é **frágil** e exige manutenção.
- O ToS deles normalmente **proíbe** acesso automatizado. Por isso o scraper fica isolado,
  com edição manual sempre disponível como rede de segurança, e roda fora do runtime da app web.

---

## Status (atualizado em 2026-07-25)

**Fase 2 em andamento** (Fases 0 e 1 entregues).

### Fase 0 — Fundação: concluída
- [x] Projeto criado a partir do template `nextjs-starter`; git reiniciado do zero (branch `main`).
- [x] Identidade ajustada: `package.json`, `layout.tsx` (metadata do clã), `README.md`, `.env.example`.
- [x] `src/lib/env.ts` (ponto único de leitura; getters lazy para vars server-only).
- [x] Supabase + **Prisma 7**: `prisma/schema.prisma`, `prisma.config.ts` (URLs fora do schema —
      mudança do Prisma 7), `src/lib/db/index.ts` (client singleton com driver adapter
      `@prisma/adapter-pg` no pooler), scripts `db:push`/`db:generate`/`db:studio`/`db:seed`.
      **Nota:** começamos com Drizzle, mas o `drizzle-kit push` tem um bug de introspecção contra o
      Postgres 17 do Supabase (lê CHECKs dos schemas `auth`/`realtime` e quebra). Trocamos por Prisma.
- [x] Duas URLs no `.env.local`: `DATABASE_URL` (pooler 6543 + `pgbouncer=true`, runtime) e
      `DIRECT_URL` (session pooler 5432, usado pelo `db push`).
- [x] `src/lib/db/seed.ts` com 1 membro real (RRRRRRRREST, admin) + 6 de EXEMPLO, 4 medalhas,
      6 atribuições, 21 snapshots em 3 datas, 3 highlights.
- [x] Branding BF6 em `globals.css` (azul `#0084C9` + superfícies `#242B2F`/`#2F383E`, dark por
      padrão) e fontes Barlow + Barlow Condensed.

Pontas soltas da Fase 0 (não bloqueiam nada):
- [ ] Substituir o roster de exemplo do seed pela lista real de membros do `fight4freedom.com.br`.
- [ ] Atualizar o CI (`.github/workflows/ci.yml`) para o fluxo do Prisma (`prisma generate` roda no
      `postinstall`; conferir se precisa de `DATABASE_URL`/`DIRECT_URL` como secrets).
- [ ] (Quando quiser) repo remoto `restlucas/fight4freedom`.

### Fase 1 — Vitrine pública: concluída
- [x] `/` home BF6 (hero com vídeo, destaques, canais do Discord), header por classe e footer.
- [x] `/membros` + `/membros/[id]` com stats, patentes, medalhas e coroa do líder por estatística.
- [x] `/medalhas` catálogo com tiers, carrossel e agrupamento.
- [x] `/ranking` por pontos do mês, com contador de temporada, busca e scroll infinito
      (`GET /api/ranking`); lógica pura em `src/lib/stats/` e `src/features/clan/lib/ranking.ts`.
- [x] Skeletons por rota, cache (`src/lib/cache.ts`) e testes unitários da lógica derivada.
- [ ] `/melhores-jogadas` é um placeholder "Em breve" — a rota existe e está linkada em
      `src/lib/site-config.ts`, mas a feature foi movida para o Backlog.

### Fase 2 — Auth + painel: concluída
- [x] Supabase Auth com Discord OAuth, fluxo de convite por token (`/entrar`, `/convite/[token]`),
      `middleware.ts` protegendo `/admin`, tabela `profile` + `requireAdmin()`.
- [x] Avatar do membro importado do Discord no callback do OAuth (`src/app/auth/callback/route.ts`),
      sem sobrescrever avatar já definido; fallback `public/member-default.png`.
- [x] Painel `/admin` com sidebar, visão geral, CRUD de membros e emissão de convites.
- [x] CRUD de medalhas com upload de arte: validação de bytes, re-encode para WebP com `sharp`
      (máx. 512px), nome de arquivo gerado no servidor, bucket `F4F-Medals` no Supabase Storage.
      **Armadilha resolvida (2026-07-25):** o upload devolvia 500 com
      `ERR_DLOPEN_FAILED: error: 127` ao carregar o `.node` do sharp. Causa: **duas** cópias de sharp
      no processo — o Next traz a sua (opcional, `^0.34.5`, para o otimizador de imagens) e o projeto
      pedia `^0.35.3`; o segundo libvips carregado no mesmo processo não acha os símbolos. Correção:
      `sharp` alinhado em `^0.34.5` + `pnpm.overrides: { "sharp": "$sharp" }` no `package.json`, que
      colapsa a árvore para uma instância só. **Ao subir a versão do Next, conferir a faixa de sharp
      que ele pede** e mover a nossa junto, senão o 500 volta.
- [x] **Atribuir/remover medalhas a membros:** diálogo por membro em `/admin/membros` com as
      conquistadas (data + nota interna + remover) e a concessão (medalha + nota opcional).
      Actions em `award-actions.ts`: concessão é *upsert* na chave `(memberId, medalId)` — reconceder
      corrige a nota sem quebrar no índice único e preserva o `awardedAt` original; revogação usa
      `deleteMany` para não explodir numa corrida entre dois admins. Ambas invalidam as tags
      `medals` **e** `members`, porque catálogo, listagem e perfil leem essa junção.
      Novo tile "Concessões" na visão geral.
- [x] **Listagens do painel (2026-07-25):** busca, filtros multiselect (cargo/plataforma em
      membros, raridade em medalhas), ordenação por conquistas no catálogo, paginação com tamanho
      de página lembrado em localStorage e header sticky. Peças compartilhadas: `src/lib/storage.ts`
      (namespace `@fight4freedom/`, regra no CLAUDE.md), `src/hooks/use-persisted-state.ts`
      (`useSyncExternalStore`, hidratação segura), `src/lib/pagination.ts` (puro, testado) e
      `src/features/admin/lib/table-styles.ts` — este último documenta por que o wrapper do
      `<Table>` do shadcn precisa ser neutralizado de fora (ele força `overflow-x-auto`, que criava
      scroll horizontal no desktop e impedia o sticky).

Fora de escopo na Fase 2 (ver Backlog): edição manual de stats, upload de melhores jogadas.

**Próximo passo:** Fase 3 — começar pelo spike do tracker.gg (ver Observações), não pelo worker.

---

## Stack a adicionar sobre o nextjs-starter

Instalar por projeto (o starter não traz nada disso):
- **Supabase**: Postgres + Auth (Discord OAuth) + **Storage** (arte das medalhas; vídeos quando
  melhores jogadas sair do Backlog).
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
- **`member` (patentes):** `platformId` (id público na plataforma, exibido no hover do ícone e
  copiável no clique) e `rankPoints` (pontos acumulados de carreira, **mockados** até a regra de
  acúmulo ser definida). A escada de 16 patentes vive em `src/lib/ranks.ts`, seguindo a hierarquia
  real do Exército (Soldado → Marechal, sem "Recruta", que não é graduação). Limiares provisórios,
  começando em 30 pontos para a primeira promoção (Cabo) e terminando em 20.000 (Marechal).
  Insígnias em `public/patentes/<slug>.webp`.
- **`medal`**: `id`, `name`, `description`, `criteria` (opcional, ex.: "20 kills sem morrer"),
  `imageUrl` (arte enviada pelo admin na Fase 2), `icon` (nome de ícone lucide, fallback enquanto
  não há arte), `tier` (`common | rare | legendary | special` — `special` só para medalhas de
  evento, interno ou externo; declarado do mais comum ao mais raro para ordenar o catálogo),
  `createdAt`, `createdBy` (nullable até a Fase 2).
- **`memberMedal`** (junção): `id`, `memberId` (FK cascade), `medalId` (FK cascade),
  `awardedAt`, `awardedBy` (nullable), `note` (nullable). Índice único `(memberId, medalId)`.
- **`statSnapshot`** (série temporal — o diferencial vs. site atual): `id`, `memberId`
  (FK cascade), `capturedAt` (timestamp), `source` (`scraper | manual | api`),
  colunas de stats BF6: `kills`, `deaths`, `matchesPlayed`, `wins`, `score`,
  `timePlayedMinutes` (todos int), `extra` (jsonb, para métricas extras sem migração).
  K/D e win-rate são **derivados** (não armazenados). "Este mês" = último snapshot menos o
  snapshot mais antigo do mês (via `date-fns`).
- **`highlight`** (melhores jogadas — **tabela criada, feature no Backlog**): `id`, `title`, `description` (nullable),
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
- `manual-provider.ts`: implementação trivial (não busca nada externo). Sem tela de edição manual,
  serve hoje como fallback/no-op — mantido porque é a rede de segurança se o scraping não vingar.
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
- `/ranking` — **ranking mensal por pontos** (decidido com o usuário na Fase 1): cada membro
  pontua pelo **progresso dentro do mês** (delta de `statSnapshot`), não pelo acumulado, com
  contador de encerramento da temporada (precisão progressiva: dias+horas, +minutos nos últimos
  7 dias, +segundos nas últimas 24 h), busca e scroll infinito de 15 em 15 via
  `GET /api/ranking`. Pesos em `src/lib/stats/points.ts` (`POINT_WEIGHTS`) são **provisórios**
  e serão definidos com o clã. Sem toggle "mês vs geral": o acumulado já vive em `/membros`,
  que ordena por K/D, kills, partidas e horas (crescente/decrescente) e **coroa o líder** de
  cada uma dessas quatro estatísticas onde ela aparecer (derivado em query, nada persistido).
- `/melhores-jogadas` — **movido para o Backlog** (2026-07-25). A rota existe como placeholder
  "Em breve" e continua no menu; decidir se some do menu até a feature ser construída.
- Componentes reutilizáveis (`src/components/` ou `src/features/clan/`): `MemberCard`,
  `MedalBadge`, `StatTile`, `RankingTable`. Escalar para `src/features/<domínio>/` quando um
  domínio passar de 3 arquivos (regra do starter).
- Testes: unit (Vitest) na lógica de ranking/derivados; E2E (Playwright) navegando as páginas.

### Fase 2 — Auth + Painel administrativo
- [x] Supabase Auth com **Discord OAuth**; `middleware.ts` protegendo `/admin`;
      tabela `profile` + guard `requireAdmin()` (análogo ao `requireUserId()` do Routina).
- [x] **Avatar do membro via Discord:** a foto vem do `user_metadata.avatar_url` no callback do
      OAuth e é gravada em `member.avatarUrl` sem sobrescrever avatar já preenchido. Fallback
      `public/member-default.png`.
- `/admin` (dashboard) e sub-rotas:
  - [x] Cadastrar/editar membros (form Zod + react-hook-form) e emitir convites.
  - [x] Criar/editar medalhas, com upload de arte para o Storage.
  - [x] **Atribuir/remover medalhas a membros** (`memberMedal`): concessão com `awardedAt`,
        `awardedBy` e `note` opcional; revogação; reflexo imediato em `/medalhas`, `/membros`
        e no perfil do membro.
- Actions do domínio admin em `src/features/admin/lib/` (`actions.ts`, `medal-actions.ts`, ...)
  com `requireAdmin()` + `revalidatePath`. UI otimista com `sonner` (padrão do Routina).
- **Removido do escopo:** edição manual de stats e upload de melhores jogadas (ver Backlog).

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
- Resiliência: falha de um handle é pulada e logada, não derruba os demais; retry/backoff em erro
  transitório. Snapshots com `source: manual` (do seed ou de um futuro fallback) nunca são
  sobrescritos — respeitar `source`/`capturedAt`.
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

## Backlog (sem fase definida)

Features acordadas como desejáveis, mas **fora de todas as fases planejadas**. Entram quando o
clã quiser; nada nas Fases 2–4 depende delas.

### Melhores jogadas (vitrine + upload de vídeo)
Decisão de 2026-07-25: não construir agora. O que fica pronto para quando voltar:
- Tabela `highlight` já existe no `prisma/schema.prisma` e o seed popula 3 registros.
- Rota `/melhores-jogadas` existe como placeholder "Em breve", linkada em `src/lib/site-config.ts`.
- Escopo quando for retomado: grade de clipes curtos (≤ 1 min) com player, título, autor e data;
  filtro por semana/mês (deriva de `playedAt` com `date-fns`); destaque para `featured`; upload no
  painel para o bucket `highlights` do Supabase Storage, com validação de duração e tamanho no
  cliente **e** no servidor; opcional gerar thumbnail.
- Pendência de produto: decidir se o link sai do menu enquanto a página for um placeholder.

### Edição manual de stats
Decisão de 2026-07-25: **não haverá tela de edição manual.** Stats vêm só do scraper (Fase 3).
Preencher 6 campos por membro à mão para ~30 membros não se sustenta na operação do clã.
- O que **fica** no código: valor `manual` no enum `StatSource`, `manual-provider.ts` e a interface
  `StatsProvider`. Custo zero hoje e evita mudança de schema depois.
- **Risco assumido:** enquanto o scraper não existir, `/ranking` e os perfis mostram dados de seed.
  O spike do tracker.gg (ver Fase 3) precisa ser validado antes de divulgar o site publicamente —
  ou o site vai ao ar sem as seções de stats. Se o spike mostrar que o scraping é inviável, a tela
  de edição manual volta a ser a única saída e sobe para uma fase.

---

## Deploy
- **App:** Vercel. **DB/Auth/Storage:** Supabase. **Scraper:** worker dedicado no Railway/Fly
  (Docker + Playwright + cron interno horário), na pasta `scraper/` do mesmo repo (Fase 3).
- CI do starter já roda lint → type-check → test → build + E2E; manter e rodar antes de commitar.

## Verificação
- **Fase 0:** `pnpm db:push` cria as tabelas; `seed` popula; `pnpm dev` sobe; type-check/lint/build verdes.
- **Fase 1:** as rotas renderizam com dados do seed; o ranking do mês bate com os snapshots;
  testes puros de ranking/derivados passam; E2E navega as páginas; visual conferido em light/dark.
- **Fase 2:** login Discord funciona; `/admin` bloqueado para não-admin; CRUD de membro e de medalha
  persistem; avatar do Discord chega no `member.avatarUrl`; conceder e revogar medalha reflete
  imediatamente em `/medalhas`, `/membros` e no perfil do membro.
- **Fase 3:** rodar o script local contra 1 handle real insere snapshot correto; cron agenda; falha de
  um handle não derruba os demais; snapshot `manual` não é sobrescrito.

## Observações
- Medalhas são **curadas e atribuídas por admins** (critérios como "20 kills sem morrer" não são
  detectáveis via scraping) — o scraper alimenta só stats numéricas; medalhas são manuais por design.
- Reaproveitar padrões do Routina: `requireUserId`/`requireAdmin` + `revalidatePath` nas actions,
  otimista com rollback + `toast`, lógica pura testável em `src/lib/*`, alias `@/*`, RSC por padrão.
- Ação pendente do usuário: confirmar viabilidade/estabilidade do scraping do BF6 no tracker.gg
  antes de investir na Fase 3. **Passou a ser crítico** desde que a edição manual saiu do escopo —
  o scraper é agora a única fonte de stats do site.
- **Spike obrigatório antes de construir o worker (Fase 3):** validar num perfil real se o tracker.gg
  (a) expõe "última partida"/total de partidas, (b) atualiza os dados sozinho ou só quando o perfil
  é aberto/"refreshado" — se for o caso (b), scraping de hora em hora pode continuar mostrando dado
  velho (provável causa do problema original com a API); verificar se abrir a página via Playwright
  já dispara o refresh — e (c) se há um endpoint JSON mais leve por baixo da página.
