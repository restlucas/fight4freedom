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
- **Recorte canônico (2026-07-27, substitui a decisão de 26/07):** o recorte é escolhido **pelo que
  o stat mede**.
  - **Duelo entre jogadores** → bucket de classes, o mesmo que o tracker.gg exibe: `kills` (com
    filtro de bot via `dividedKills.human`), `deaths`, `assists`, `revives`.
  - **Objetivo e controle de mapa** → `gm_all`, todos os modos, veículos, Portal e REDSEC:
    capturados, defendidos, destruídos, armados, neutralizados, setores, tempo em objetivo, spots,
    cura, reparos, vitórias, derrotas, tempo jogado.

  A metade dos objetivos **não é escolha**: o `classes[]` tem nove campos e nenhum contador de
  objetivo, então alinhar tudo é impossível.

  **Atenção, contra a intuição: o bucket de classes NÃO exclui bots.** Ele significa "atribuído a
  uma classe de infantaria". Só `kills` tem filtro de bot de verdade; **`assists` e `revives`
  continuam contando bots**, porque a API não publica variante humana de nenhum dos dois (payload
  varrido inteiro em 27/07). Foram para o bucket de classes por paridade com o tracker.gg, que o
  clã trata como referência, não porque bots saíram.

  Verificado contra a API: kills 12.320, deaths 4.126, assists 4.365, revives 3.062 — os quatro
  iguais ao tracker.gg. Racional completo em `docs/api-gametools.md` §3 e §10.3.

- **Cadência e lote da coleta (revisado em 2026-07-28):** **todos os membros elegíveis a cada
  ciclo** — o clã quer todas as informações frescas, e isso não muda. O que mudou é o tamanho do
  lote: **3 jogadores por requisição** (era 10, depois 5).

  Não é escolha de educação com a API, é **teto medido**. Contra a API real em 27/07: lotes de
  **10, 25, 50 e 76 devolvem 504 em exatamente 15,2 s**. O 504 bate sempre nos mesmos 15,2 s
  independente do tamanho, ou seja, é timeout de gateway do lado deles. O payload reforça: ~700 KB
  por jogador, então 10 jogadores voltaram como 8,2 MB.

  **De 5 para 3 (28/07).** A primeira medição só comparou 10 contra 5 e parou no primeiro número
  que funcionava. Medindo o mesmo roster nos três tamanhos, em sequência:

  | Lote | Lotes com 504 | Sucesso     | **Segundos por membro LIDO** |
  | ---- | ------------- | ----------- | ---------------------------- |
  | 5    | 50%           | 3,5-10,4 s  | 4,02 s                       |
  | 3    | 14%           | 2,0-11,1 s  | **2,22 s**                   |
  | 1    | 10%           | ~3,5 s méd. | 5,17 s                       |

  A última coluna é a que decide, e ela **não é monotônica**: um jogador por requisição tem a
  melhor taxa de sucesso e a pior vazão, porque a ida e volta se dilui num membro só.

  O que torna a falha cara não é a taxa, é o **custo fixo**: um lote que falha gasta 15,2 s do
  orçamento de 45 s e não traz ninguém. Com lote 5 isso consumia metade das tentativas. Em termos
  de execução: lote 5 lê ~11 membros por execução, lote 3 lê ~20. Contra ~77 elegíveis, é a
  diferença entre **precisar de dois ciclos de cron e terminar dentro de um**.

  Por isso a fila é ordenada por quem está mais desatualizado e **cada lote é gravado assim que
  chega** — quem uma execução não alcança é exatamente quem a próxima começa atendendo.

  **Retentativa por RODADAS (28/07).** Cada rodada é uma passada completa sobre quem ainda está sem
  leitura, então quem falhou só é perguntado de novo depois de o resto do roster ser varrido. Três
  consequências, e a primeira é a que importa:

  1. **Passa tempo entre as tentativas.** O 504 é o gateway deles desistindo da EA em 15,2 s.
     Perguntar de novo dois segundos depois faz a mesma pergunta ao mesmo caminho frio; minutos
     depois é outra pergunta.
  2. Todo mundo recebe a primeira tentativa o quanto antes, em vez de a fila travar atrás de um
     lote que gasta 15,2 s duas vezes seguidas.
  3. As rodadas finais são minúsculas, então podem gastar **um jogador por requisição**, o que isola
     quem está realmente estourando em vez de deixá-lo derrubar dois membros sadios.

  O perfil do worker é `[3, 3, 1]`: contra os 14% de falha por lote medidos, três passadas deixam
  ~0,3% de lotes sem leitura por ciclo (0,14³), contra 14% de uma passada só.

  **O que é retentável não mudou, e é carga estrutural:** só a resposta **inteiramente vazia**. O
  vazio total é a assinatura de requisição morta (o 504 derruba os 3 juntos), enquanto uma resposta
  boa omite apenas quem a fonte realmente não tem — retentar um jogador genuinamente sem dados
  gastaria uma ida e volta por ciclo para ouvir a mesma coisa. Esse é resolvido na hora, como
  `no_data`, e nunca entra na fila de retentativa.

  **O status só é escrito no fim.** Um membro cuja primeira requisição morreu e cuja segunda
  funcionou tem de aparecer uma vez, como sucesso. Gravar `no_data` por lote (a forma antiga)
  registraria a falha primeiro e deixaria o painel acusando sync quebrado de quem está bem.

  `roundsRun`, `retriedBatches` e `recoveredByRetry` vão no relatório para a decisão ser medível.

  Nada disso reduz a taxa de falha — 14% das requisições continuam morrendo, porque a causa é o
  gametools esperando a EA. O que muda é o **custo** da falha, e era o custo que o teto de 60 s da
  Vercel tornava impagável (ver Deploy > Agendamento).

  **`statsReadAt` (28/07).** Coluna nova, separada de `statsCheckedAt`. Uma responde "quando
  tentamos pela última vez", a outra "que idade tem o dado que temos". Sem as duas, um membro pode
  ser tentado a cada ciclo por horas e ainda carregar número de ontem — se toda tentativa caiu em
  lote falhado — e **nada no banco diria isso**. Não dá para usar a data do snapshot no lugar:
  snapshot só existe quando o membro jogou, então idade de snapshot mede jogo, não coleta.
  A linha "Última coleta de dados" no painel passou a ler `statsReadAt`; construída sobre
  `statsCheckedAt` ela anunciaria "há 1 min" no meio de um apagão completo.

  **Continuação encadeada (2026-07-27) — REMOVIDA em 2026-07-28.** Existia só para contornar o teto
  de 60 s da Vercel: uma execução que parava no orçamento com fila pendente disparava uma sucessora
  de si mesma via `after()`, até quatro vezes, porque uma função de 60 s não varria o roster. A
  profundidade viajava em `?chain=N`, e o `MAX_CHAIN_DEPTH` era o único freio de um endpoint que
  chamava a si mesmo.

  Funcionava, e o worker tornou o mecanismo inteiro desnecessário: o primeiro ciclo real na Railway
  varreu **75 membros em 164,9 s com `deferred: 0`**, dentro de um orçamento de 8 min. Rota que se
  invoca não vale ser mantida para um botão manual, então saiu junto com o `pg_cron`.

  A cadência de 10 min passa a 20 min quando o desenvolvimento terminar (ver a seção no fim deste
  documento).

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

## Status (atualizado em 2026-07-28)

**Fases 0 a 3.6 concluídas.** O app está no ar em `fight4freedom.vercel.app`, a coleta roda no
**worker do Railway** a cada 10 min (o `pg_cron` foi desligado em 28/07), e o **roster real de 98
membros está no banco** (Fase 3.6). O ranking começa a contar do zero: não há histórico, e o
primeiro board com pontuação aparece quando os membros acumularem dois snapshots no mesmo mês.

**Primeiro ciclo real no Railway (28/07), e é o número que fecha a Fase 3:** 75 elegíveis varridos
em 164,9 s, `deferred: 0`, 2 rodadas, 4 lotes com 504 e **11 membros resgatados pela segunda
rodada** — 11 que numa passada só teriam ficado sem leitura. A taxa de falha da fonte segue em 16%
(4 de 25 lotes), coerente com os 14% medidos: o que mudou foi o custo dela, não a taxa. Sobrou 66%
do orçamento de 8 min.

O que resta antes da Fase 4:

- **Corrigir ~28 `platformId` pelo painel.** Estado em 27/07, com 99 elegíveis: **71 já têm
  snapshot**, e os outros 28 se dividem em dois problemas com a mesma causa.

  **23 sem identidade EA.** A fila foi drenada com `pnpm db:resolve-identities` (roda local, e por
  isso ignora o cap de 10 por ciclo da função): 74 de 97 em 229 s. Reexecutar recupera falhas
  transitórias — a primeira passada deixou 30 pendentes, a segunda 23. Esses não existem na EA com o
  id que veio do export (12 `ea`, 8 `psn`, 3 `xbox`).

  **5 com identidade mas sem nenhum dado de BF6.** `dusales`, `exposiitto`, `F4F Richard`, `Ovaca` e
  `Wislan Andrade`. Consultados um a um contra a API: **sem `gm_all`, sem `classes`, `human = 0`**.
  Não é falha do coletor — o `toRawStats` devolve `null` corretamente e o membro vira `noData`. O
  sinal provável é pior que id errado: a busca casou com **outra conta EA de mesmo nome de exibição**,
  então estamos apontando para a pessoa errada. Vale conferir o id com cada um desses cinco.

  **Custo de deixar assim:** os 23 consomem as 10 buscas de identidade de todo ciclo (~10 s do
  orçamento de 45 s) em tentativas que sempre falham, e esse tempo sai do fetch de quem tem
  identidade válida.

- **Teste de fidelidade da §8** com um membro (até ele, não divulgar as seções de stats).
- **Emitir convites** para os membros ganharem login, perfil e avatar do Discord. O import cobre
  aparecer no site e pontuar; convite cobre ter conta.

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

Pontas soltas da Fase 0:

- [x] **Roster real importado (2026-07-27): 98 membros** do export do `fight4freedom.com.br`,
      via `pnpm db:import-roster`. Os 29 de exemplo e todos os snapshots mockados foram apagados
      no mesmo passo — o ranking passa a contar do zero, a partir da primeira coleta.
      Detalhes na Fase 3.6 abaixo.
- [x] CI corrigido (2026-07-27). Estava **vermelho desde 25/07** em todo push, nas duas jobs, por
      falta de `DATABASE_URL`: o client do Prisma é construído no escopo do módulo
      (`src/lib/db/index.ts`), então o `next build` estourava em "Failed to collect page data for
      /auth/callback" e o servidor do Playwright não renderizava nada. Correção: um serviço
      Postgres 17 descartável em cada job, com `prisma db push` (e `seed` na job de E2E).
      **CI nunca aponta para o Supabase** — a job de E2E roda o seed, que apaga tudo.
- [x] Repo remoto `restlucas/fight4freedom`.

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
      Actions em `award-actions.ts`: concessão é _upsert_ na chave `(memberId, medalId)` — reconceder
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
- [x] `pnpm db:push` aplicado (`tracker_handle` saiu, `ea_persona_id`/`ea_nucleus_id` entraram)
      e `pnpm db:seed` rodado.
- [x] `CRON_SECRET` definido e agendamento criado no Supabase (`pg_cron` + `pg_net`, `*/10`).
- [x] Primeira coleta real validada de ponta a ponta: a rota devolveu
      `{eligible: 2, updated: 0, unchanged: 2, ...}` com os dois membros que já vincularam o
      Discord, e gravou snapshots `source: api` conferindo com o `gm_all`.
- [x] **Armadilha do agendador resolvida (2026-07-27):** ~47% dos ciclos morriam em silêncio.
      O `pg_net` tem timeout **padrão de 5 s** e a rota leva de 2 a 6 s (a chamada ao gametools
      com cache frio), então metade das execuções era abortada. O pior é o diagnóstico: o
      `cron.job_run_details` marca `succeeded` porque o SQL rodou; a falha só aparece em
      `net._http_response` (`timed_out = true`). Correção: `timeout_milliseconds := 30000` na
      chamada do job (o SQL na seção Deploy > Agendamento já está atualizado).
      **Ao depurar coleta, olhar `net._http_response`, não `cron.job_run_details`.**
- [x] **Guarda contra payload parcialmente zerado (2026-07-27):** ver a seção de armadilhas da
      camada de stats abaixo.
- [ ] Cadastrar o roster real no painel e rodar o teste de fidelidade da §8 com o clã.

**Próximo passo:** roster real + teste de fidelidade. Depois disso, Fase 4.

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
  (FK cascade), `capturedAt` (timestamp), `source` (`manual | api`), `bestClass` e os contadores
  crus: `kills` (**só contra humanos**), `deaths` (bucket de classes), e do `gm_all` os `wins`,
  `losses`, `assists`, `revives`, `headshots`, `objectivesCaptured`, `timePlayedMinutes` (todos
  int), mais `extra` (jsonb: `allModeKills`, `allModeDeaths`, `classKills`, `allModeKillDeath`,
  `allModeKillsPerMinute`, `matches`, `secondsPlayed`, `winPercent`, `damagePerMinute`).
  **Não existem colunas `score` nem `matchesPlayed`**: partidas são `wins + losses`, e K/D,
  win-rate, kills por partida e horas são **derivados** em `src/lib/stats/snapshots.ts`, nunca
  armazenados. "Este mês" = último snapshot menos o snapshot mais antigo do mês (via `date-fns`),
  o que torna qualquer linha ruim no início do mês uma base de cálculo errada para o mês inteiro.
- **`highlight`** (melhores jogadas — **tabela criada, feature no Backlog**): `id`, `title`, `description` (nullable),
  `memberId` (FK, nullable — de quem é a jogada), `videoPath` (caminho no bucket Storage),
  `thumbnailPath` (nullable), `durationSeconds` (int, validado ≤ 60), `playedAt` (date — base
  para filtrar por semana/mês), `featured` (bool default false), `createdBy`, `createdAt`.
- **`profile`** (Fase 2): mapeia usuário autenticado (Supabase `auth.users.id`) → papel de
  sistema `isAdmin` (bool) e opcional `memberId`. Controla quem acessa o painel.

Ranking é **calculado em query/RSC**, não persistido (mais partidas no mês, melhor K/D, mais
pontos do mês), a partir de `statSnapshot`. Os pontos vêm de `POINT_WEIGHTS`
(`src/lib/stats/points.ts`) aplicados ao **delta do mês**, e os pesos continuam **provisórios**
até serem acertados com o clã.

---

## Camada de dados de stats — `src/lib/stats/`

Isola a origem para permitir troca sem tocar no app (implementada em 2026-07-26):

- `provider.ts`: interface `StatsProvider { searchPlayer(name); fetchStats(identities[]) }` e os
  tipos `PlayerIdentity` (personaId + nucleusId) e `RawStats` — já no **nosso** vocabulário. O
  docblock de `RawStats` é o contrato que qualquer provider substituto tem de honrar: kills sem
  bots, deaths do mesmo bucket das kills, resto em todos os modos
  (docs/api-gametools.md §3 e §10.3).
- `gametools.ts`: `GametoolsProvider`. Zod valida só o que lemos (`.loose()` no resto);
  `seperation=true` + `format_values=false` sempre. Kills de `dividedKills.human`, deaths do
  top-level (bucket de classes), o resto do grupo `gm_all`, `bestClass` derivado de `classes[]`, e
  os totais não exibidos guardados no `extra`. **Sem `dividedKills.human`, o membro é tratado como
  sem dados** — cair para `gm_all.kills` colocaria bots numa coluna que promete não tê-los. Lotes
  sequenciais de `STATS_BATCH_SIZE` (hoje **3**, medido) via `POST /bf6/multiple/`; lote com erro é
  pulado e tentado no ciclo seguinte.
  Testado contra `gametools.fixture.ts`, um payload real trimado — o parser não depende da rede.
- `collect.ts`: o ciclo de coleta — elegíveis (`active` + `discordId`), resolve identidades
  faltantes (máx. 10 buscas por ciclo, o resto cura nos próximos), busca em lote, compara com o
  último snapshot (`hasNewActivity`) e grava `statSnapshot` `source: api` **só de quem jogou**.
  Retorna um relatório por membro (updated/unchanged/no-data/identity-pending).
- `snapshots.ts`: funções **puras** e testáveis — `computeKd`, `computeWinRate`,
  `deltaForMonth(snapshots, month)`, `rankMembers(...)` — com testes colocados (`*.test.ts`).

O valor `manual` do enum `StatSource` continua no schema (custa zero); um `manual-provider.ts`
só será escrito se algum dia voltar a edição manual. Como a coleta só escreve `api`, na prática
**toda linha `manual` no banco é placeholder do seed**.

### Armadilha: payload parcialmente zerado (2026-07-26/27)

Aconteceu na primeira coleta real. A API devolveu, no mesmo bucket `gm_all`, `kills: 0` e
`deaths: 0` junto com `killDeath: 3.55`, `kpm: 1.41` e `dividedKills.human: 12320`. Ou seja: não
era um jogador zerado, era uma resposta corrompida em dois campos.

O prejuízo veio em dobro. Primeiro gravamos um snapshot falso. No ciclo seguinte a API respondeu
certo (17587 kills) e o `hasNewActivity` leu `0 -> 17587` como partida nova, gravando um segundo
snapshot e um pico fictício. Como o `deltaForMonth` usa o snapshot **mais antigo do mês** como
base, esse membro passaria a exibir a carreira inteira como progresso do mês.

Correção: `isIncoherentBucket()` em `gametools.ts`, chamada por `toRawStats`, que devolve `null`
(= trata como sem dados, e o coletor retenta no ciclo seguinte) quando o bucket se contradiz:

- `kills == 0` com `killDeath`, `kpm` ou `humanKills` positivos — os três derivam de kills;
- `kills == 0` e `deaths == 0` com `matches > 0` — ninguém termina partida sem morrer uma vez.

O teste é sempre **contradição interna**, nunca "os números parecem baixos": um jogador de
primeira sessão tem zeros coerentes e precisa passar, senão nunca gravamos a estreia de ninguém.

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

### Fase 1 — MVP: Vitrine pública (dados semeados) — _entrega apresentável_

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

_(Reescrita em 2026-07-26; o scraper do tracker.gg foi descartado — ver `docs/api-gametools.md`.)_

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
  3. Stats em **lotes sequenciais de 3** (`POST /bf6/multiple/`, um request em voo por vez) — o
     tamanho é medido, ver "Cadência e lote da coleta" nas Decisões. Ids em vez de nomes: mais
     rápido e imune a troca de nick.
  4. **Só grava quem jogou**: snapshot novo apenas se kills/deaths/wins/losses/tempo mudaram
     desde o último (`hasNewActivity`). Pior caso teórico com 50 membros × 144 ciclos/dia é alto,
     mas o filtro corta para ~o número de sessões reais de jogo; revisitar se a tabela crescer.
  5. Cache da vitrine (`CACHE_TAG.stats`) é purgado quando algo foi gravado.
- **Resiliência:** lote com erro é logado e pulado (os demais seguem); membro sem retorno fica
  para o próximo ciclo; a rota falha fechada sem `CRON_SECRET`; um ciclo perdido não é incidente.
- **Snapshots `manual` nunca são sobrescritos** — a coleta só insere linhas novas com
  `source: api`, nunca atualiza linhas existentes.

### Fase 3.5 — Ranking por trabalho em equipe: concluída (2026-07-27)

Etapa criada entre as Fases 3 e 4 por decisão do dono do clã: o esquema de pontuação passa a
premiar jogo coletivo acima de abate, e o ranking ganha histórico de temporadas.

**Pontuação.** Pesos em `src/lib/stats/points.ts`, agora **definidos** (não mais provisórios).
O racional completo está no cabeçalho do arquivo; o resumo é que **peso não define prioridade,
peso × frequência define**. Kills acontecem 34 vezes por partida e objetivo destruído 0,03 vez,
então "kill peso 3 contra objetivo destruído peso 50" ainda entrega 103 pontos para combate
contra 1,35. Os pesos foram calibrados contra os números reais dos dois membros do clã até
equipe ficar em 73,3% e 75,4% do total, com combate em 12,8% e 6,3%. **As frações, não os pesos,
são o contrato** — e é o que `points.test.ts` afirma, usando os totais reais de carreira.

Duas exclusões deliberadas:

- **`repairs` não pontua.** É travado em Engenheiro: um membro tem 6.756 reparos de carreira, o
  outro tem exatamente 0 porque nunca joga a classe. Pontuar isso viraria imposto sobre quem joga
  outra coisa. **Continua sendo coletado**, porque histórico não se reconstrói se o clã mudar de ideia.
- **`deaths` não desconta.** Jogar o objetivo faz morrer mais; punir morte trabalharia contra o
  próprio esquema.

`spots` foi verificado antes de entrar: um membro tem 2.581 marcações com só 4,8% do tempo de
classe em Recon, o que daria 7,76 marcações por minuto de Recon — logo, marcar conta para todas
as classes, não é exclusivo de Recon.

**Justiça entre classes** é o risco central desse esquema, e o que o segura são os contadores de
objetivo, que são class-agnósticos (conquistas por partida em 2,25 vs 1,81; tempo em objetivo em
205 s vs 213 s entre dois perfis bem diferentes). Os contadores de apoio são a metade enviesada,
então nenhum stat travado em classe pode dominar.

**Kills passaram a excluir bots (2026-07-27, depois da calibração).** `kills` virou
`dividedKills.human` e `deaths` passou a vir do bucket de classes. O detalhe que torna isso
não-óbvio: **"todos os modos sem bots" não existe na API da EA** — não há split humano/bot por
modo, e o `dividedKills.human` é global, calculado sobre o bucket de classes. Aplicar o
`humanPrecentage` (89,96%) ao total geral daria 15.821, número que não existe em lugar nenhum e que
suporia densidade de IA igual em todos os modos.

O par kills/deaths não foi escolhido por gosto: 12.320 ÷ 4.126 = **2,99**, exatamente o
`infantryKillDeath` que a API publica. Com `gm_all.deaths` daria 2,49, razão que ela nunca reporta.

Efeito sobre a pontuação: `kills` pesa 0,3 e responde por ~11% do total, então o ranking muda pouco.
Efeito sobre a vitrine: as kills passam a ser **o mesmo número do tracker.gg**, encerrando a
divergência de 5.267 kills (3.892 de recorte de bucket, 1.375 de bots).

**Assists e revives seguiram para o bucket de classes (2026-07-27).** Investigando por que a
aplicação mostrava 6.080 assists e 3.451 revives contra 4.365 e 3.062 no tracker.gg, ficou claro que
o tracker exibe o bucket de classes em tudo, e que estávamos misturando: kills e deaths do bucket de
classes, assists e revives do `gm_all`. Alinhados.

O que **não** se confirmou, e por isso está registrado em letras grandes no estudo: o bucket de
classes **não exclui bots**. Não existe assists nem revives filtrados por humano na API. A troca
compra paridade com o tracker, não remoção de bot. O clã aceitou isso explicitamente.

O `devidedAssists.human` (1.277) não serve de substituto: suas partes irmãs são `driver`,
`passenger`, `spot` e `pilot`, o que indica "assist como infantaria" e não "assist contra humano".

**Achado colateral:** a fixture de teste nunca tinha recebido os nove contadores de equipe
adicionados nesta fase. Todos liam 0 pelo `.default(0)` do Zod e **nenhum teste podia detectar**.
Corrigido com os valores reais, e agora há teste afirmando cada um.

**Headshots: investigado e encerrado (2026-07-27).** `headshots` fica no `gm_all.headshotKills`
(2.874), e isso **não é concessão, é a única leitura possível**. Confirmado varrendo o payload:
nenhuma das cinco entradas de `classes[]` tem qualquer campo com "head". O `headShots` = 1.973 do
top-level, que eu havia suspeitado ser o bucket de classes, **não é** — o bucket de classes não
tem headshots. Não existe alternativa a escolher.

**Constantes de teste atualizadas (2026-07-27).** O `points.test.ts` usava os totais de carreira
pré-mudança (kills 17.587, assists 6.080, revives 3.451), que descreviam dados que a coleta já não
produz. Relidos pela API através do `toRawStats`. As frações **melhoraram** e seguem dentro da
meta: equipe 74,4% e 75,4% (era 73,3% e 75,4%), combate 10,4% e 6,0% (era 12,8% e 6,3%). Nenhum
peso precisou de retoque — as kills caírem ~30% encolheu combate mais rápido do que a queda de
assists (−28%) e revives (−11%) encolheu apoio.

**Schema.** Nove colunas novas em `statSnapshot`: `objectivesDefended`, `objectivesDestroyed`,
`objectivesArmed`, `objectivesDisarmed`, `sectorsDefended`, `objectiveTimeSeconds`, `spots`,
`healthRestored` e `repairs`. Todas com `@default(0)`, então o `db push` foi **aditivo, sem perda
de dados**. Para não repetir o erro de listar colunas à mão em query (uma coluna esquecida não
quebra a compilação, ela silenciosamente zera o delta daquele contador), `snapshots.ts` passa a
exportar `STAT_TOTALS_SELECT` e `pickTotals`, derivados das próprias chaves de `StatTotals`.

**Migração dos dados.** Os 91 snapshots que existiam foram apagados
(`pnpm db:clean-examples --reset-snapshots`), porque todos leriam 0 nas colunas novas e o mais
antigo viraria base falsa — a mesma armadilha do `isIncoherentBucket`, só que vinda do nosso
próprio histórico. Nada permanente se perdeu: snapshot guarda **total de carreira**, que a API
reserve a cada ciclo. Preservados: membros, medalhas, concessões, `profile` (acesso ao painel) e
convites.

**UI do ranking.**

- [x] **Sem destaque para o 1º lugar.** O `RankingSeasonBar` (faixa dourada com avatar, coroa e
      "Líder do mês") foi **removido**: o esquema premia jogo coletivo, então coroar um indivíduo
      contradiz a própria pontuação. O destaque agora são os 4 primeiros, pelo divider.
- [x] Divider "Demais membros" separando os 4 primeiros do resto (4 porque o clã joga em esquadrão
      de 4). Some durante busca, porque lista filtrada não é pódio, e some quando o board não é
      maior que o corte.
- [x] Contador de encerramento movido para dentro do card de busca, alinhado à direita com
      `ml-auto` (não `justify-between` no pai: o painel quebra em telas estreitas e o
      `justify-between` afastaria o campo de busca do contador quando dividem a mesma linha).
      Com o líder fora, o prazo era o único fato de página inteira que restava, e um fato só não
      justifica uma faixa. O `loading.tsx` foi refeito para espelhar o layout novo (chips de
      temporada, contador dentro do painel, divider após a 4ª linha).
- [x] **Altura do card de busca fixada** em `md:h-15`. Para caber em uma linha, o contador virou
      horizontal: ícone e "Encerra em" à esquerda dos dígitos, e cada chip passou a ter valor e
      sufixo na **mesma linha** ("08h") em vez de empilhados — empilhado, cada chip era mais alto
      que o campo de busca e era ele que ditava a altura do painel. A altura só entra a partir de
      `md`, porque abaixo disso os controles precisam quebrar (travar lá cortaria o campo de busca
      em vez de encurtar o card), e o `md:flex-nowrap` só é seguro porque o campo de busca ganhou
      `min-w-0` para encolher enquanto contador e relógio mantêm o tamanho.
- [x] **Superfície do 1º lugar: cor de card normal, sem transparência nenhuma.** O dourado vive
      **só na borda e nos acentos** — borda amarela, trilho de 4px à esquerda, chip do número 1 em
      dourado sólido, coroa e barra de progresso amarelas. Nenhum tingimento no fundo.

      Duas tentativas anteriores erraram e vale não repetir. A primeira usava
                                                                  `bg-yellow-500/[0.08]`, que **substituía** o `bg-card/80` da base e deixava a linha do líder
                                                                  com _menos_ superfície que as linhas de baixo: um tom quase invisível sobre `backdrop-blur`
                                                                  puro. A segunda punha `bg-card` opaco sob um dégradé `from-yellow-400/20 ... to-transparent`;
                                                                  nada mais atravessava, mas **uma lavagem com alfa continua parecendo lavada**, porque overlay
                                                                  que desaparece é exatamente a aparência de transparência, mesmo sobre tinta opaca.

                                                                  `--card` é `oklch(0.284 0.012 235)`, sem alfa, então `bg-card` sozinho já é sólido.
                                                                  `hover:bg-card` é repetido porque o `hover:bg-card/95` da base devolveria a translucidez no
                                                                  hover, e `backdrop-blur-none` porque desfocar atrás de preenchimento opaco só gasta
                                                                  composição.

                                                                  O enriquecimento vem de **fora** do preenchimento: brilho dourado
                                                                  (`shadow-xl shadow-yellow-500/30`, mais forte no hover) e um anel interno de 1px
                                                                  (`ring-1 ring-yellow-400/25 ring-inset`). A regra que separa o que funciona do que foi
                                                                  rejeitado é curta: **alfa em `shadow` é bem-vindo, alfa em `background` não.** A sombra
                                                                  pinta na página atrás da linha; fundo com alfa vira película sobre a superfície. O anel é
                                                                  uma linha de 1px colada na borda, não um tingimento.

                                                                  `ranking-row.test.tsx` trava isso: assere que a linha do líder não tem `bg-card/{alfa}`,
                                                                  nem fundo amarelo com alfa, nem dégradé, que ela tem brilho `shadow-yellow-*`, e que as
                                                                  linhas comuns seguem translúcidas. São asserções em nome de classe, normalmente frágeis
                                                                  demais para valer a pena, aceitas aqui porque **esse bug foi entregue duas vezes** — e
                                                                  porque provam o que eu não conseguia afirmar de outro jeito: que o `tailwind-merge` de
                                                                  fato resolve `bg-card/80` para `bg-card` e `shadow-black/20` para `shadow-yellow-500/30`
                                                                  nessa linha.

- [x] Seletor de temporadas com links (`/ranking?mes=2026-06`), para temporada encerrada ser
      compartilhável. Só aparece quando existe mais de uma temporada. `getRankingMonths()` lista
      apenas meses em que **algum membro tem 2+ snapshots**, porque com um único snapshot o delta
      é zero e o mês apareceria como board zerado, parecendo bug.
- [x] Contador de encerramento só na temporada em curso.

**Histórico mockado.** `pnpm db:mock-history` cria as 3 temporadas anteriores **mais a em curso**,
com top 10.

Regra importante da temporada em curso: ela **exclui membros que a coleta alcança**
(`discordId` preenchido). Não é preciosismo, é corretude — o delta é último-menos-primeiro dentro
do mês, então uma linha mockada de abertura (algumas centenas de kills) seguida de uma linha real
de fechamento (carreira inteira, dezenas de milhares) reportaria a vida toda do membro como
progresso do mês. Temporadas encerradas não têm esse risco, porque o coletor só escreve em "agora"
e nunca cai num mês fechado. O snapshot de fechamento da temporada em curso é estampado em
**"agora"**, não no fim do mês, para não existir data de captura no futuro.
Importante entender por que não é uma lista de pontuações: o ranking nunca lê score gravado, ele
calcula o **delta** entre o primeiro e o último snapshot do mês, e snapshot guarda total
cumulativo. Então o mock precisa ser uma carreira crescente coerente — dois snapshots por membro
por mês, cada mês abrindo exatamente onde o anterior fechou. Os dados saem com `source: manual`,
o que significa que **`pnpm db:clean-examples` apaga esse histórico** (correto, é andaime, mas os
dois scripts são opostos e a ordem importa).

**Escopo de código encerrado.** Não há mais nada a construir nesta etapa. O que segue abaixo é
operação e acompanhamento, não trabalho pendente de desenvolvimento.

Operação, uma vez, logo após o deploy deste commit:

```bash
pnpm db:clean-examples --reset-snapshots --apply   # remove os snapshots pre-migracao
pnpm db:mock-history --apply                       # recompoe as 4 temporadas
```

Por que é necessário: confirmado em produção no ciclo de 18:30 de 2026-07-27, o build que estava
publicado não conhecia as colunas novas, então gravou `kills` correto e **0 nas 9 colunas de
equipe**. Duas linhas assim viraram base falsa em julho. Não crescem sozinhas (o coletor só grava
quando os contadores mudam), mas precisam sair antes de a coleta com o código novo acumular por
cima.

Acompanhamento, sem prazo:

- Os **dois membros reais** aparecem com 0 ponto na temporada em curso até a coleta acumular dois
  snapshots no mesmo mês. Ficam fora do mock justamente para não misturar dado fabricado com real;
  conforme jogarem, entram no board por conta própria.
- **Rever os pesos depois de um mês real com o roster completo.** A calibração usou a carreira de
  dois membros, ambos com Support dominante. Um mês real de ~50 membros e classes variadas pode
  revelar distorção que dois perfis não mostram — em especial no `revives`, hoje a maior linha
  isolada da pontuação (19% a 22%), e parcialmente dependente de classe.

### Fase 3.6 — Roster real e ajustes do ranking: concluída (2026-07-27)

**98 membros importados** do export do site v1, via `pnpm db:import-roster` (dry run por padrão,
`--apply` para valer, idempotente). Quatro campos aproveitados; o resto do export é a pontuação do
site antigo e não tem equivalente aqui:

| Export                         | Nosso campo  | Tratamento                                    |
| ------------------------------ | ------------ | --------------------------------------------- |
| `Nome`                         | `nickname`   | trim (três linhas vinham com espaço na ponta) |
| `ID`                           | `platformId` | trim; é a chave de busca dos stats            |
| `Plataforma`                   | `platform`   | `PC → ea`, `PS5 → psn`, `XBOX → xbox`         |
| `progressao.patenteAtual.nome` | `rankPoints` | via escada de `src/lib/ranks.ts`              |

**Por que a patente virou `rankPoints`:** não existe coluna de patente — `ranks.ts` **deriva** a
patente dos pontos. Então preservar a patente de alguém significa gravar o limiar que a nossa escada
mapeia para ela. Os limiares deles são outros (Marechal deles é 5.000, o nosso é 20.000), por isso
só o **nome** da patente atravessa, nunca os pontos. O mapeamento é uma tabela explícita
(`RANK_ALIASES`) e não regex, porque a notação difere — eles escrevem "3º Sargento", a escada do
Exército escreve "Terceiro-Sargento" — e patente desconhecida precisa **parar** o import com o nome
na tela, em vez de jogar todo mundo em Soldado silenciosamente.

**`collectWithoutLogin`, a exceção documentada.** A regra normal é que membro só entra na coleta
depois de aceitar o convite, porque o `discordId` prova isso. Esses 98 precisam aparecer e pontuar
sem esperar login, então ganharam uma coluna própria. **Não** semeamos `discordId` falso de
propósito: é o único campo que todo o fluxo de auth trata como prova de identidade, e valor
inventado ali funcionaria hoje e viraria armadilha para quem depois construísse sobre ele. Default
`false`, então todo membro novo daqui em diante segue o convite. Quem carrega a flag **ainda precisa
de convite** para ter login, perfil e avatar do Discord — até lá, avatar padrão.

**Dois conflitos resolvidos de forma conservadora:**

- O admin aparece no export com `ID: "MELA123"`, enquanto o banco tinha o `RRRRRRRREST`, que
  resolve na EA e retorna stats. **O banco venceu.** Regra do script: identidade EA já resolvida
  tem precedência sobre valor não verificado da lista. Sem isso, a coleta do admin quebrava.
- `xuveroo` **não está** no export mas tem login próprio. Membro com `profile` nunca é apagado,
  mesmo ausente da lista. Ficaram 99 membros no banco, não 98.

**O arquivo do export não fica em `public/`.** Ele mora em `data/`, que é gitignored. Qualquer coisa
sob `public/` é servida como asset estático, então o dump — que traz o id de plataforma de todos os
membros — seria baixável pelo site.

**Ajustes no ranking:**

- [x] **Numeração ordinal em vez de competição.** `withOrdinalRanks` numera 1..N e dá a cada linha
      seu próprio número. Com 8 membros pontuando e 90 em zero, o ranking de competição imprimia
      "9" noventa vezes, o que lê como bug e não como empate. Empate desempata alfabeticamente para
      a ordem ser estável. O `withCompetitionRanks` continua existindo e em uso pelos líderes por
      estatística, onde empate compartilhar posição é o comportamento certo.
- [x] **Temporada encerrada mostra só os 10 primeiros** (`RANKING_HISTORY_LIMIT`). O corte é
      aplicado nos dois consumidores — página e route handler — e **antes da busca**, senão daria
      para revelar o 40º colocado digitando o nome dele. Não é aplicado dentro do
      `getMonthlyRanking` porque isso faria uma query cacheada depender da data de hoje.
- [x] **Sem divider no histórico**, substituído por "10 melhores colocados" alinhado à direita no
      card de busca. O divider significa "o esquadrão de cima, e depois todos os outros", e num
      pódio de 10 linhas não há "todos os outros" para separar.
- [x] **Explicação da pontuação saiu do rodapé** para um hover card atrás de um "?" ao lado da linha
      da temporada. Troca um bloco a que ninguém rola por um affordance no lugar onde a dúvida
      nasce: ao lado do número que o membro está questionando. O gatilho é um `<button>` de verdade,
      porque o Radix abre o hover card também no **foco**, e é assim que teclado e toque chegam nele.

### Fase 3.7 — Diagnóstico de sincronização no painel: concluída (2026-07-27)

Uma coluna **Stats** em `/admin/membros` dizendo se a coleta de cada membro está funcionando, e um
botão para tirar da coleta quem tem cadastro errado.

**O problema era de dados, não de UI.** Não havia como saber se a última busca falhou: snapshot só é
gravado quando os contadores mudam, então um membro buscado com sucesso e sem novidade fica
**idêntico** a um membro cuja busca quebrou — nenhuma linha nova nos dois casos. Três colunas novas
resolvem: `statsCheckedAt` (quando tentamos, com sucesso ou não), `statsStatus` (o desfecho) e
`statsPaused` (o interruptor do admin).

O coletor grava o desfecho com um `updateMany` por grupo de resultado a cada lote, não um update por
membro — uma varredura toca ~76 linhas e isso a mantém em poucas declarações. O `statsCheckedAt`
avança **em toda tentativa, inclusive nas que falham**: a pergunta do painel é "quando tentamos e o
que aconteceu", e um timestamp que só anda no sucesso não responde isso.

**Seis estados, cada um com uma ação:**

| Badge                 | Significa                          | O que fazer                                   |
| --------------------- | ---------------------------------- | --------------------------------------------- |
| Sincronizando (verde) | Última tentativa leu os stats      | Nada                                          |
| Aguardando            | Na fila, nunca tentado             | Esperar                                       |
| ID não encontrado     | O id não casa com nenhuma conta EA | Corrigir o id                                 |
| Sem dados de BF6      | Conta achada, sem stats de BF6     | Conferir o id: casou com outra conta homônima |
| Pausado               | Admin tirou da coleta              | Retomar quando corrigir                       |
| Fora da coleta        | Inativo ou sem vínculo             | —                                             |

Os dois estados de erro são **problemas diferentes com correções diferentes**, e o badge antigo
"Stats pendentes" juntava os dois — são exatamente os 23 e os 5 diagnosticados na Fase 3.6. Abaixo do
badge vai o tempo desde a última tentativa, que é o que transforma badge em diagnóstico:
"Sincronizando" com verificação de dois dias atrás significa coleta parada, e sem o timestamp isso
parece saudável.

O estado é resolvido em `queries.ts` (`syncState`), não no JSX: a resposta depende de quatro colunas
interagindo, e espalhar isso em ternário é como um membro acaba exibido como "sincronizando"
enquanto o coletor nunca olha para ele.

**Pausar em vez de desativar.** Antes, para impedir o coletor de gastar requisição com um id errado,
a única saída era `active = false` — que tira o membro de `/membros` e do ranking também, punindo a
pessoa por um problema de cadastro. Pausado continua visível, só não consome requisição. O botão só
aparece quando pausar faz sentido; para quem já está fora da coleta seria um controle mentiroso.

Também separei duas colunas que estavam misturadas: "Conta" exibia o badge de stats dentro dela,
confundindo login do Discord com coleta. São perguntas diferentes e agora são colunas diferentes.

**Ferramentas de triagem na coluna (2026-07-27).** Com 99 membros e ~28 problemas, o badge sozinho
não bastava:

- **Filtro por estado**, multi-select como os de cargo e plataforma, com as opções listadas **por
  urgência** e não em ordem alfabética — o filtro lê como uma lista de triagem.
- **Ordenação pelo cabeçalho**, ciclando entre desligado, problemas primeiro e sincronizados
  primeiro. Ordena por **urgência**: alfabética enterraria "ID não encontrado" entre "Fora da
  coleta" e "Pausado", o oposto do motivo de alguém abrir a coluna.
- **Botão "Atualizar"** na barra. A coluna é renderizada no servidor e o coletor roda no ritmo dele,
  então a página fica minutos atrás sem nada estar errado. Preferido a polling: consultar o banco em
  laço por um painel que ninguém está encarando é desperdício, e o botão é honesto sobre ser manual.
- **Botão de pausar antes do badge**, em espaço de largura fixa reservado mesmo quando vazio. Largura
  fixa no badge seria frágil — bastaria reescrever um rótulo para desalinhar de novo. É o mesmo
  truque que a coluna "Ações" já usava.
- **Ícone girando no "Aguardando"**, e é honesto: o estado realmente está em movimento, já que a
  varredura leva dois ou três ciclos e o membro fica ali até chegar a vez dele.

Os rótulos saíram para `lib/member-sync.ts`, compartilhados entre badge, filtro e ordenação. Com três
consumidores, um rótulo que diverge entre badge e filtro vira um filtro em que ninguém confia.

**Ambiguidade de acessibilidade encontrada pelos testes:** o filtro e a ordenação ficaram ambos com o
nome acessível "Stats". O botão de ordenar ganhou `aria-label` descrevendo a ação, mantendo a palavra
visível no começo para o nome acessível continuar contendo o rótulo (WCAG 2.5.3).

**Limitação conhecida do estado `no_data`, medida antes de acreditar no próprio badge.** No primeiro
ciclo real com carimbo, 15 membros caíram nesse estado enquanto só **5** não têm dado de BF6 de
verdade. Os outros 10 eram 504 transitórios: o coletor **não distingue** "o lote falhou" de "o
jogador não tem dados", porque nos dois casos o jogador some do mapa devolvido pelo provider. Por
isso o badge se chama "Sem retorno" e o texto **não acusa o id** — diria a coisa errada em dois
terços dos casos, mandando um admin caçar dez problemas inexistentes. O estado se autocorrige no
ciclo seguinte, e o texto orienta a só investigar se persistir.

Separar de verdade exigiria o `fetchStats` reportar quais jogadores estavam num lote que falhou, o
que muda o contrato do `StatsProvider`. Vale fazer se as falhas transitórias continuarem frequentes.

### Fila da coleta: a armadilha do indicador que não avança (2026-07-28)

Vale ler antes de mexer na ordenação de `collect.ts`, porque o erro é natural e passou duas vezes.

**Sintoma:** o painel mostrava 39 "Aguardando" de 76, e em quatro minutos a fila andou **um membro**.
O aproveitamento parecia ~50% quando o esperado era 90–95%.

**Não era a API nem o orçamento.** Era a ordenação. A fila ordenava pela **data do último snapshot**,
e um membro buscado com sucesso que **não jogou não ganha snapshot novo** — a data dele nunca avança.
Ele fica cravado no início da fila e é rebuscado a cada execução, enquanto quem está atrás nunca é
alcançado. O sinal no relatório era `updated: 0, unchanged: 20`: vinte membros lidos e nenhuma
novidade, ou seja, a execução gastou o orçamento inteiro relendo gente que já tinha snapshot. Se a
fila estivesse girando, os nunca-visitados apareceriam como `updated`, porque o primeiro snapshot
sempre conta como novidade.

É a **mesma inanição** que a ordenação alfabética causava e que já tinha sido "corrigida" — a troca
foi por um indicador que também não avança. A regra que faltava: **ordenar pelo que a própria ação
atualiza.** `statsCheckedAt` avança em toda tentativa, inclusive nas que falham, então a fila gira.
`collect.test.ts` trava isso com o cenário exato — membro ocioso, tentado agora, vai por último —
e com um teste que impede o `snapshots` de voltar ao `select` usado na ordenação.

**Diagnóstico do painel, no mesmo dia.** O estado `waiting` significa "não carimbado desde que a
coluna existe", **não** "nunca coletado". Os 38 nesse estado tinham snapshots de 22:40–23:10 e
estavam sincronizando bem: o número real era 71 de 76, **93,4%**. O rótulo virou
"Aguardando 1ª leitura" e o texto diz explicitamente que não indica problema.

Lição que vale além deste caso: quando um número do painel contradiz a expectativa, **conferir se o
painel mede o que promete** antes de caçar o sistema. Aqui o coletor estava a 93% e a leitura dizia
50%.

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

- **App:** Vercel. **DB/Auth/Storage:** Supabase. **Coleta de stats:** worker no **Railway**
  (`worker/main.ts`), no mesmo repositório, com comando de start próprio. A rota
  `/api/stats/collect` continua existindo como o botão "coletar agora" do painel.
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

**Decisão (2026-07-28): worker no Railway.** O agendador em si nunca foi o problema — o teto de 60 s
da função da Vercel era. Uma requisição que dá 504 gasta sempre 15,2 s, então dentro de 60 s não
cabia retentativa: começar uma perto do prazo matava a função no meio da escrita, e função morta
nunca chega no código que dispara a sucessora, o que parava a cadeia inteira. O teto não tornava as
falhas mais raras, tornava-as **irrecuperáveis**.

Alternativa considerada e descartada: subir o plano da Vercel (US$ 20/mês) elevaria o teto com uma
configuração em vez de um serviço novo. O Railway já está contratado a US$ 5, então a conta resolveu
sozinha.

Por que **cron job** e não processo sempre ligado: a agenda fica no Railway, não num `setInterval`.
Sem timer para manter vivo, sem processo longo para vazar, e um crash é uma execução que a plataforma
marca como falha em vez de uma parada silenciosa. O `worker/main.ts` roda um ciclo e sai com
`process.exit`, e o `db.$disconnect()` é obrigatório: o pool do Prisma seguraria o processo aberto, e
cron job que não termina bloqueia a própria execução seguinte.

**O que configurar no Railway:**

| Item                  | Valor                                                            |
| --------------------- | ---------------------------------------------------------------- |
| Serviço               | novo, no **mesmo repositório** (não repo separado)                |
| Start command         | `pnpm worker`                                                    |
| Cron schedule         | `*/10 * * * *`                                                   |
| `DATABASE_URL`        | **exatamente** a mesma string da Vercel, sem trocar a porta      |
| `CRON_SECRET`         | o mesmo valor da Vercel — é o que autentica a purga de cache     |
| `NEXT_PUBLIC_APP_URL` | URL de produção do site. **Obrigatória aqui**, ver abaixo        |

Sobre o `DATABASE_URL`: copiar sem alterar. O nosso aponta para o pooler do Supabase na porta
**5432** (modo sessão), e para o worker isso é o mais adequado, não uma concessão — ele abre uma
conexão, faz o ciclo e encerra, que é o caso em que modo sessão é melhor que o transacional (6543).
O 6543 existe para serverless, onde dezenas de invocações concorrentes disputam conexão. Aqui é um
processo só.

Três armadilhas de configuração, todas de falha silenciosa:

- **O tipo do serviço.** A Railway cria serviço web por padrão e roda o start command do
  `package.json`, que aqui é `next start`. O serviço da coleta tem de ser **cron job**, com start
  command `pnpm worker` e schedule `*/10 * * * *`. Serviço web rodaria uma segunda cópia do site em
  vez da coleta, e o log pareceria saudável.

- **`NEXT_PUBLIC_APP_URL`.** No app ela tem fallback para `localhost` (o request carrega o host
  real). No worker não há request, e com o fallback ele faria POST de purga para uma máquina
  inexistente: a vitrine serviria número velho pelo TTL inteiro e nada falharia. Por isso
  `serverEnv.siteUrl` é obrigatória, separada de `publicEnv.appUrl`.
- **`NODE_ENV=production` no serviço.** Faz o `pnpm install` pular devDependencies, e aí o
  `postinstall` (`prisma generate`) não roda e o worker quebra no import do client. O `tsx` foi
  movido para `dependencies` porque virou dependência de runtime; o `prisma` segue em dev, então
  **não** definir `NODE_ENV=production` (ou usar `NPM_CONFIG_PRODUCTION=false`).

Verificação local antes de subir, contra o banco real:

```bash
pnpm worker:local
```

#### Agendador antigo (pg_cron) — desligado em 2026-07-28

A extensão `pg_cron` foi desabilitada no Supabase, o que também apaga a definição do job, então ele
não volta sozinho. A virada seguiu a ordem: worker rodando um ciclo real → conferir o relatório →
desligar o `pg_cron` → remover a continuação encadeada da rota.

Se algum dia precisar reativar (a configuração está no `<details>` abaixo), vale lembrar do detalhe
que atrapalhava o diagnóstico: o `pg_net` tem timeout de 30 s e a rota podia levar até 60, então o
`net._http_response` marcava `timed_out = true` em ciclos que na verdade funcionaram — o `after()`
seguia rodando no servidor depois de o cliente desistir.

#### Como ler o log do worker

Painel da Railway: **serviço → Deployments → o mais recente → Deploy Logs**, filtrando por
`[worker]`. Pelo terminal, `railway logs` depois de `railway login` e `railway link`.

O ciclo saudável abre com `[worker] ciclo iniciado` e fecha com `[worker] ciclo concluido em Xs`,
com os contadores do relatório. Avisos `[stats] lote gametools falhou ... 504` **são esperados** — é
a taxa de 14% da fonte, e a linha `resgatado(s)` no fim é a prova de que as rodadas recuperaram. O
que não é esperado é `adiados` diferente de zero (fonte degradada, o worker avisa) ou um segundo
`ciclo iniciado` no mesmo log (reinício de verdade). A Railway às vezes embaralha a ordem das linhas,
inclusive o `Starting Container`, e isso não indica nada.

Um aviso do painel de que o serviço "exited" é o comportamento correto: o worker sai com
`process.exit(0)` de propósito.

<details>
<summary>Configuração do pg_cron (histórico, até o desligamento)</summary>

A rota é agnóstica de agendador: qualquer coisa que faça um GET/POST com
`Authorization: Bearer $CRON_SECRET` serve. A decisão anterior foi **Supabase pg_cron + pg_net** — já
pagávamos pelo Supabase, é preciso no horário e gratuito, enquanto o Vercel Cron no plano Hobby só
permite cadência diária e o cron do GitHub Actions é impreciso e consome minutos do repo privado.

Uma vez, no SQL Editor do Supabase (extensões `pg_cron` e `pg_net` em Database > Extensions):

```sql
select cron.schedule(
  'collect-bf6-stats',
  '*/10 * * * *',
  $$
  select net.http_post(
    url                  := 'https://<dominio-do-app>/api/stats/collect',
    headers              := '{"Authorization": "Bearer <CRON_SECRET>"}'::jsonb,
    -- OBRIGATÓRIO. O padrão do pg_net é 5 s e a rota leva de 2 a 6 s, então sem
    -- isso ~metade dos ciclos é abortada. Ver a Fase 3 no Status.
    timeout_milliseconds := 30000
  );
  $$
);
```

Para inspecionar/remover: `select * from cron.job;` e `select cron.unschedule('collect-bf6-stats');`.
Trocou o `CRON_SECRET`? Atualizar nos dois lugares (Vercel env + job).

**Como saber se a coleta está mesmo rodando.** O `cron.job_run_details` mostra se o _SQL_ rodou,
não se o HTTP respondeu — ele marca `succeeded` mesmo quando a requisição foi abortada. A verdade
está em `net._http_response`:

```sql
select created, status_code, timed_out, left(content, 300)
from net._http_response
order by created desc
limit 10;
```

`status_code` nulo com `timed_out = true` é ciclo perdido. Com `200`, o `content` traz o relatório
por membro, que é a forma mais rápida de ver quem está em `identity-pending`.

</details>

**Nota de segurança:** o `CRON_SECRET` fica em texto puro no `command` do job, legível por
qualquer um com acesso ao SQL Editor do projeto. É aceitável (só admins têm), mas se o segredo
vazar por outro caminho, rotacionar significa atualizar a env na Vercel **e** reagendar o job.

### Scripts de manutenção

- `pnpm db:seed` — **destrutivo**: limpa e reconstrói as tabelas que ele governa. Desde 2026-07-27
  ele **se recusa a rodar** quando o banco tem membro com Discord vinculado ou snapshot
  `source: api`, porque isso apagaria os membros reais e os `profile` que dão acesso ao painel
  (e conceder admin exige já ser admin, então não há volta). Override deliberado: `SEED_FORCE=1`.
- `pnpm db:clean-examples` — remove só o andaime do seed de um banco que já tem gente real:
  os 29 membros inventados, os snapshots `manual` (placeholders por definição) e os snapshots
  `api` que a guarda de coerência hoje rejeitaria. **Dry run por padrão**; aplica com `--apply`.
  É o caminho para tirar os dados de exemplo quando o roster real entrar pelo painel.
- `pnpm invite:admin` — reemite o convite de admin (ver Convite de admin acima).

**Armadilha recorrente: `db:push` exige reiniciar o `pnpm dev`.** Mordeu três vezes em 2026-07-27,
sempre com a mesma cara — `PrismaClientValidationError: Unknown field` numa página que compila e
passa no build. O Turbopack recarrega código-fonte, mas **não** recarrega dependência de
`node_modules`, e o client do Prisma mora lá. Um dev server aberto antes do `db:generate` segue com
o client antigo indefinidamente: num dos casos o processo estava de pé havia cinco horas e três
mudanças de schema.

Como reconhecer que é isso e não bug de código: a mesma query roda sem erro via
`pnpm exec tsx` (que carrega o client do disco) e o `pnpm build` passa. O `db:push` agora imprime o
lembrete no fim.

## Verificação

- **Fase 0:** `pnpm db:push` cria as tabelas; `seed` popula; `pnpm dev` sobe; type-check/lint/build verdes.
- **Fase 1:** as rotas renderizam com dados do seed; o ranking do mês bate com os snapshots;
  testes puros de ranking/derivados passam; E2E navega as páginas; visual conferido em light/dark.
- **Fase 2:** login Discord funciona; `/admin` bloqueado para não-admin; CRUD de membro e de medalha
  persistem; avatar do Discord chega no `member.avatarUrl`; conceder e revogar medalha reflete
  imediatamente em `/medalhas`, `/membros` e no perfil do membro.
- **Fase 3:** `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/stats/collect`
  devolve o relatório e insere snapshot correto para 1 membro real (conferir
  kills = `dividedKills.human`, **não** `gm_all.kills`, e que `extra.allModeKills` guarda o total
  com bots);
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
  com o tracker.gg, endpoints e armadilhas mapeados. O recorte canônico foi revisado em 27/07:
  kills sem bots (§10.3).
- **Pendência com o clã** (única restante, não bloqueia o deploy): teste de fidelidade/frescor da
  §8 do estudo — conferir com um membro se os números batem com a tela do jogo e medir o atraso
  da EA após uma partida. Até lá, não divulgar as seções de stats.
- O **id da plataforma** cadastrado precisa ser o id exato da conta (o formulário avisa e exige).
  Id errado = membro eterno em "Stats pendentes"; corrigir o id rebinda a identidade
  automaticamente, no salvar ou no ciclo seguinte da coleta.

---

## Ajustes a fazer quando o desenvolvimento terminar

Lista curta de coisas que estão de um jeito **porque estamos desenvolvendo**, e que precisam mudar
antes de considerar o projeto em regime.

### Cadência da coleta: 10 min → 20 min, no máximo

Decidido em 2026-07-27. A ideia de 30 min foi levantada e **descartada no mesmo dia**: a cadeia cobre
a capacidade, mas não repesca falha de requisição (ver a ressalva abaixo), e a 30 min um membro que
deu 504 esperaria meia hora pela segunda chance. Vinte minutos é o teto.

O racional para sair dos 10: com a cadeia, um tick cobre até 5 execuções (~185 membros de
capacidade), então uma varredura completa cabe num tick e disparar de 10 em 10 min passa a sobrepor
ciclos sem ganhar frescor — o cache de borda do gametools é de ~10 min de qualquer forma
(`docs/api-gametools.md` §10.2), e stats só mudam quando alguém joga.

```sql
select cron.unschedule('collect-bf6-stats');
select cron.schedule('collect-bf6-stats', '*/20 * * * *', $$
  select net.http_post(
    url                  := 'https://<dominio-do-app>/api/stats/collect',
    headers              := '{"Authorization": "Bearer <CRON_SECRET>"}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);
```

**Condição 1 — a cadeia dispara em produção: CONFIRMADO (2026-07-27).** O `after()` do Next depende
da plataforma manter a função viva depois de a resposta sair, o que funciona no teste e podia não
funcionar no ambiente real. Verificado pelos **timestamps das gravações**, sem depender do relatório:
no tick das 22:50 houve escrita aos 24 s, 38 s, 42 s, **80 s e 137 s**. Uma execução com orçamento de
45 s termina por volta dos 45 s, então as duas últimas só podem ter vindo de invocações posteriores —
ao menos três execuções num tick. Cobertura foi de 60 para 71 dos 76 membros com identidade.

Detalhe que parece falha e não é: as execuções gravaram 5, 4, 1, 1, 1, em queda. Depois que um membro
tem snapshot, releitura com contadores iguais devolve `unchanged` e **não grava**. A queda é o poço de
nunca-coletados esvaziando.

**Condição 2 — `timeout_milliseconds` em 60000: APLICADO (2026-07-27, `jobid 3`).** Com 30 s o
`pg_net` desistia antes de a função responder e o corpo do relatório **nunca chegava**. A gravação
não se perdia (persistência é por lote), mas a observabilidade sim: sem o relatório não há como ver
quem ficou em `identity-pending` nem quantos foram `deferred`. Confirmar a cadeia por timestamp
funcionou uma vez, mas é perícia, não monitoramento.

**Custo conhecido de subir a cadência:** falha de requisição (504, o erro comum dessa API) resulta
em `noData`, **não** em `deferred`, e por isso **não** é repescada pela cadeia — ela espera o próximo
tick. A 10 min um membro que falhou volta a ser tentado em 10 min; a 30 min, espera 30. Se as falhas
se mostrarem frequentes, o caminho é fazer a cadeia repescar `noData` (com cuidado: membro que falha
sempre consumiria a cadeia inteira todo tick), não voltar a cadência para 10 min.

### Outras pontas do modo desenvolvimento

- **23 membros com `platformId` inválido** consomem 10 buscas de identidade por ciclo (~10 s do
  orçamento) que sempre falham, e esse tempo sai do fetch de quem tem identidade válida. Corrigir
  os ids pelo painel resolve; se demorar, vale um backoff para não pagar isso a cada ciclo.
- **`pnpm db:mock-history` e `pnpm db:clean-examples`** existem para o andaime do desenvolvimento.
  Com o roster real no banco, `clean-examples` só serve ao `--reset-snapshots`; o `mock-history`
  não deve mais ser rodado, porque criaria temporadas falsas ao lado das reais.
- **Pesos do `POINT_WEIGHTS`** foram calibrados com dois membros, ambos Support. Revisar depois de
  um mês real com o roster completo e classes variadas.
