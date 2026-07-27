# Fight4Freedom v2 — Vitrine do clã de Battlefield 6

## Contexto

O clã tem hoje o site `fight4freedom.com.br` (v1). A v2 é uma reconstrução como plataforma
que valoriza o esforço de cada membro: uma **vitrine pública** (home convidativa, membros,
medalhas do clã e ranking/stats) mais um **painel administrativo** para cadastrar membros,
criar medalhas e atribuí-las.

Stats vêm da **API do gametools.network** (proxy da API oficial da EA), decidido em 2026-07-26
após o estudo `docs/api-gametools.md` provar que ela entrega exatamente os mesmos dados que o
tracker.gg — número por número — sem scraping, sem Playwright e sem worker separado. O plano
original de scraper do tracker.gg foi **descartado**. Toda a origem de dados fica atrás da
interface `StatsProvider` (`src/lib/stats/provider.ts`), então trocar de fonte não reescreve o app.

Base do projeto: o template `nextjs-starter` (Next 16 App Router + React 19 + TS strict +
Tailwind v4 + shadcn configurado, CI já pronto). App **única** (não monorepo).

### Decisões firmadas com o usuário
- **Fonte de dados (2026-07-26):** stats vêm da **API do gametools.network**, atrás de
  `StatsProvider`. O scraping do tracker.gg foi descartado (ver `docs/api-gametools.md` §6 e §10:
  mesma fonte EA, sem antibot, sem worker). A tela de edição manual continua descartada
  (2026-07-25); o valor `manual` do enum `StatSource` permanece no schema como porta de saída.
- **Bucket canônico (2026-07-26):** kills/stats **completos** — todos os modos, veículos, Portal
  e REDSEC (`gm_all`, com `seperation=true`). Racional e mapeamento em `docs/api-gametools.md` §3
  e §10.3.
- **Cadência da coleta (2026-07-26):** **todos os membros elegíveis a cada 10 min**, em lotes
  sequenciais de **10 jogadores** por requisição (`POST /bf6/multiple/`), para não sobrecarregar a
  API comunitária. ~50 membros = 5 requisições por ciclo.
- **Ciclo de vida do membro na coleta (2026-07-26):**
  1. Admin cadastra nick + plataforma + **id da plataforma (obrigatório)** → **ainda não entra
     na coleta**;
  2. Membro aceita o convite e entra com Discord (`member.discordId` é capturado do OAuth) →
     **entra na próxima leva**;
  3. A identidade EA (`eaPersonaId`/`eaNucleusId`) é resolvida automaticamente a partir do
     **`platformId`** — no cadastro (best-effort) e pelo coletor (self-healing) — e é ela que a
     coleta usa dali em diante.
- **Nick x id da plataforma (2026-07-26):** são papéis distintos e não devem ser confundidos.
  O `nickname` é **só exibição** (como o membro aparece no site, livre para ter tag, acento,
  apelido). O `platformId` é o **id exato da conta** (ex.: `RRRRRRRREST` na EA) e é a chave que
  busca os stats — por isso é obrigatório no formulário. Trocar o nick não dispara nada; trocar o
  id da plataforma rebinda a identidade.
- **MVP (Fase 1):** vitrine pública com dados semeados manualmente. Admin e coleta vêm depois.
- **Auth admin:** Discord OAuth (via Supabase Auth).
- **Melhores jogadas (vitrine + upload):** movido para o Backlog (2026-07-25), sem fase definida.
- Sem pressão de prazo; entregue em fases ("o que der pra fazer").

### Riscos assumidos (API gametools)
- **Terceiro comunitário, sem SLA nem rate limit publicado.** Mitigações: uma leva de lotes por
  ciclo, nunca chamar a API no runtime das páginas (o banco é a fonte do site), falha silenciosa
  com retry no ciclo seguinte, e a interface `StatsProvider` para trocar de fonte sem reescrever.
- **Frescor depende da EA.** O gametools proxia a EA com cache de borda de ~10 min — igual à
  cadência da coleta. O atraso da própria EA após uma partida ainda não foi medido (teste com o
  clã pendente, `docs/api-gametools.md` §8).

---

## Status (atualizado em 2026-07-26)

**Fase 3 com código entregue** (Fases 0, 1 e 2 entregues); faltam os passos operacionais
(db push, seed, `CRON_SECRET`, agendador) listados na seção da Fase 3 abaixo.

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

### Fase 3 — Coleta de stats via API: código entregue (2026-07-26)
- [x] Spike concluído: `docs/api-gametools.md` valida a fonte, o bucket `gm_all` e a paridade
      com o tracker.gg. O plano de scraper foi substituído por este fluxo.
- [x] Camada de stats: `src/lib/stats/provider.ts` (interface), `gametools.ts` (client com Zod,
      fixture real e testes), `collect.ts` (coletor com relatório por membro e testes do sinal
      de atividade).
- [x] `POST|GET /api/stats/collect` protegida por `CRON_SECRET` (comparação timing-safe).
- [x] CRUD de membros: campo de tracker removido; `platformId` passou a ser obrigatório e é a
      chave de busca; identidade EA resolvida no cadastro/edição (best-effort) e exposta no painel
      como badge "Stats pendentes" quando o id não foi encontrado na EA.
- [ ] Rodar `pnpm db:push` (troca `tracker_handle` por `ea_persona_id`/`ea_nucleus_id`) e
      `pnpm db:seed`.
- [ ] Definir `CRON_SECRET` (local e Vercel) e criar o agendamento (ver Deploy > Agendamento).
- [ ] Trocar o roster de exemplo pela lista real e validar a primeira coleta de ponta a ponta.

**Próximo passo:** aplicar o schema, agendar a coleta e rodar a primeira leva real.

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
- **Playwright** já vem no starter (E2E). Só para testes — a Fase 3 via API não usa browser.
- **date-fns** para cálculos de "este mês" nos rankings.

Data fetching: **Server Components + Server Actions** por padrão (a vitrine é read-only).
TanStack Query só se algum trecho do painel exigir interatividade cliente pesada — não assumir upfront.

---

## Modelo de dados — `prisma/schema.prisma` (Prisma, `pnpm db:push`)

- **`member`**: `id` (uuid text PK), `nickname` (**só exibição**, livre), `platform`
  (`ea | xbox | psn`), `platformId` (**id exato da conta, obrigatório** no formulário: é a chave
  de busca dos stats e o valor exibido no hover do ícone da plataforma),
  `eaPersonaId` + `eaNucleusId` (identidade estável na EA, resolvida automaticamente a partir do
  `platformId` — nunca digitada; é o que a coleta usa, então renomear a conta não quebra),
  `discordId` (nullable, capturado só pelo OAuth), `avatarUrl` (nullable),
  `role` (`member | officer | admin` — cargo no clã, só exibição; acesso de sistema é o
  `profile.isAdmin`), `joinedAt` (date), `active` (bool default true), `createdAt`, `updatedAt`.
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

Isola a origem para permitir troca sem tocar no app (implementada em 2026-07-26):
- `provider.ts`: interface `StatsProvider { searchPlayer(name); fetchStats(identities[]) }` e os
  tipos `PlayerIdentity` (personaId + nucleusId) e `RawStats` — já no **nosso** vocabulário, com a
  semântica do bucket `gm_all` (docs/api-gametools.md §3).
- `gametools.ts`: `GametoolsProvider`. Zod valida só o que lemos (`.loose()` no resto);
  `seperation=true` + `format_values=false` sempre; lê o grupo `gm_all`, deriva `bestClass` de
  `classes[]` e guarda `dividedKills.human` (o número que o tracker.gg exibe) no `extra`. Lotes
  sequenciais de 10 via `POST /bf6/multiple/`; lote com erro é pulado e tentado no ciclo seguinte.
  Testado contra `gametools.fixture.ts`, um payload real trimado — o parser não depende da rede.
- `collect.ts`: o ciclo de coleta — elegíveis (`active` + `discordId`), resolve identidades
  faltantes (máx. 10 buscas por ciclo, o resto cura nos próximos), busca em lote, compara com o
  último snapshot (`hasNewActivity`) e grava `statSnapshot` `source: api` **só de quem jogou**.
  Retorna um relatório por membro (updated/unchanged/no-data/identity-pending).
- `snapshots.ts`: funções **puras** e testáveis — `computeKd`, `computeWinRate`,
  `deltaForMonth(snapshots, month)`, `rankMembers(...)` — com testes colocados (`*.test.ts`).

O valor `manual` do enum `StatSource` continua no schema (custa zero); um `manual-provider.ts`
só será escrito se algum dia voltar a edição manual.

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

### Fase 3 — Coleta de stats via API gametools — a cada 10 min, todos os elegíveis
*(Reescrita em 2026-07-26; o scraper do tracker.gg foi descartado — ver `docs/api-gametools.md`.)*

- **Sem worker, sem Docker, sem Railway.** A coleta é uma Route Handler no próprio app
  (`/api/stats/collect`) disparada por um agendador externo (ver Deploy > Agendamento). O que o
  plano antigo chamava de "Fase 3" encolheu para: rota + provider + cron.
- **Fluxo do ciclo** (`src/lib/stats/collect.ts`):
  1. Elegíveis: `active = true` **e** `discordId` preenchido (= aceitou o convite e entrou com
     Discord — regra do ciclo de vida nas Decisões).
  2. Identidades EA faltantes são resolvidas pelo `platformId` (`GET /bf6/player/`), no máximo 10
     por ciclo — um lote grande de membros novos se resolve em poucos ciclos sem estourar a
     duração da função. Membro sem `platformId` (linha antiga) não tem o que buscar e fica
     pendente até um admin preencher.
  3. Stats em **lotes sequenciais de 10** (`POST /bf6/multiple/`, um request em voo por vez) —
     ~50 membros = 5 requests. Ids em vez de nomes: mais rápido e imune a troca de nick.
  4. **Só grava quem jogou**: snapshot novo apenas se kills/deaths/wins/losses/tempo mudaram
     desde o último (`hasNewActivity`). Pior caso teórico com 50 membros × 144 ciclos/dia é alto,
     mas o filtro corta para ~o número de sessões reais de jogo; revisitar se a tabela crescer.
  5. Cache da vitrine (`CACHE_TAG.stats`) é purgado quando algo foi gravado.
- **Resiliência:** lote com erro é logado e pulado (os demais seguem); membro sem retorno fica
  para o próximo ciclo; a rota falha fechada sem `CRON_SECRET`; um ciclo perdido não é incidente.
- **Snapshots `manual` nunca são sobrescritos** — a coleta só insere linhas novas com
  `source: api`, nunca atualiza linhas existentes.

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
Decisão de 2026-07-25: **não haverá tela de edição manual.** Stats vêm só da coleta via API
(Fase 3). Preencher 6 campos por membro à mão para ~50 membros não se sustenta na operação do clã.
- O que **fica** no código: valor `manual` no enum `StatSource` e a interface `StatsProvider`.
  Custo zero hoje e evita mudança de schema depois.
- O argumento ficou mais forte em 2026-07-26: a fonte automática deixou de ser frágil (API em vez
  de scraping). Se o gametools sumir um dia, a interface `StatsProvider` permite trocar de fonte;
  a edição manual só volta ao escopo se não existir fonte nenhuma.

---

## Deploy
- **App:** Vercel. **DB/Auth/Storage:** Supabase. **Coleta de stats:** dentro do próprio app
  (`/api/stats/collect`) — nenhuma infra nova.
- CI do starter já roda lint → type-check → test → build + E2E; manter e rodar antes de commitar.

### Convite de admin (bootstrap)
O primeiro acesso ao painel vem do convite que o `pnpm db:seed` imprime no terminal. O token é
guardado **hasheado**, então um link perdido não é recuperável — só substituível, e o painel não
resolve (conceder admin exige já ser admin). Para reemitir sem apagar o banco:

```bash
pnpm invite:admin
```

Sem argumento ele pega o membro com cargo `admin`; passe o nick para escolher outro
(`pnpm invite:admin Vortex`). O link novo invalida o anterior não usado, como no painel.

### Agendamento da coleta (a cada 10 min)
A rota é agnóstica de agendador: qualquer coisa que faça um GET/POST com
`Authorization: Bearer $CRON_SECRET` serve. Decisão: **Supabase pg_cron + pg_net** — já pagamos
pelo Supabase, é preciso no horário e gratuito, enquanto o Vercel Cron no plano Hobby só permite
cadência diária e o cron do GitHub Actions é impreciso e consome minutos do repo privado.

Uma vez, no SQL Editor do Supabase (extensões `pg_cron` e `pg_net` em Database > Extensions):

```sql
select cron.schedule(
  'collect-bf6-stats',
  '*/10 * * * *',
  $$
  select net.http_post(
    url     := 'https://<dominio-do-app>/api/stats/collect',
    headers := '{"Authorization": "Bearer <CRON_SECRET>"}'::jsonb
  );
  $$
);
```

Para inspecionar/remover: `select * from cron.job;` e `select cron.unschedule('collect-bf6-stats');`.
Trocou o `CRON_SECRET`? Atualizar nos dois lugares (Vercel env + job).

## Verificação
- **Fase 0:** `pnpm db:push` cria as tabelas; `seed` popula; `pnpm dev` sobe; type-check/lint/build verdes.
- **Fase 1:** as rotas renderizam com dados do seed; o ranking do mês bate com os snapshots;
  testes puros de ranking/derivados passam; E2E navega as páginas; visual conferido em light/dark.
- **Fase 2:** login Discord funciona; `/admin` bloqueado para não-admin; CRUD de membro e de medalha
  persistem; avatar do Discord chega no `member.avatarUrl`; conceder e revogar medalha reflete
  imediatamente em `/medalhas`, `/membros` e no perfil do membro.
- **Fase 3:** `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/stats/collect`
  devolve o relatório e insere snapshot correto para 1 membro real (conferir kills = `gm_all`);
  sem o header devolve 401; segundo ciclo sem partida nova não grava linha (`unchanged`); membro
  com `platformId` errado aparece como `identity-pending` e ganha o badge "Stats pendentes";
  membro sem Discord vinculado não aparece no relatório; snapshot `manual` não é sobrescrito.

## Observações
- Medalhas são **curadas e atribuídas por admins** (critérios como "20 kills sem morrer" não são
  detectáveis na API) — a coleta alimenta só stats numéricas; medalhas são manuais por design.
- Reaproveitar padrões do Routina: `requireUserId`/`requireAdmin` + `revalidatePath` nas actions,
  otimista com rollback + `toast`, lógica pura testável em `src/lib/*`, alias `@/*`, RSC por padrão.
- **Spike concluído (2026-07-25/26):** `docs/api-gametools.md` respondeu tudo o que travava a
  Fase 3 — fonte é a própria EA (sem "abrir o perfil" para atualizar), paridade número a número
  com o tracker.gg, bucket canônico `gm_all` definido, endpoints e armadilhas mapeados.
- **Pendência com o clã** (única restante, não bloqueia o deploy): teste de fidelidade/frescor da
  §8 do estudo — conferir com um membro se os números batem com a tela do jogo e medir o atraso
  da EA após uma partida. Até lá, não divulgar as seções de stats.
- O **id da plataforma** cadastrado precisa ser o id exato da conta (o formulário avisa e exige).
  Id errado = membro eterno em "Stats pendentes"; corrigir o id rebinda a identidade
  automaticamente, no salvar ou no ciclo seguinte da coleta.
