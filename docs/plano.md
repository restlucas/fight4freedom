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

  **"Nunca lido" separado de "sem retorno" (28/07).** Um membro que **nunca** foi lido com sucesso,
  nem uma vez (`statsReadAt` nulo), não é o mesmo caso de um membro cujo lote falhou nesta rodada. O
  primeiro não se resolve com mais ciclos; o segundo se resolve sozinho no próximo.

  Os dois usavam o mesmo badge, e isso custou dias. Quatro membros falhavam em todo ciclo desde o
  cadastro, indistinguíveis de falha transitória, então ninguém investigou. Quando investigamos, a
  causa era a mesma nos quatro e tinha correção de um minuto: o `eaName` casava com uma conta EA que
  **existe mas não é da pessoa**, sem nenhum dado de BF6. Um deles foi resolvido só corrigindo o nome
  (`Bravo_six762` → `F4F WISLAN`, conta com 836 partidas e 315 h).

  Três peças novas, todas derivadas do que já existia no banco, sem mudança de schema:

  - **`isEmptyProfile`** (`gametools.ts`) reconhece a resposta de uma conta sem BF6 nenhum:
    `gameModeGroups` vazio, `classes` vazio e zero tempo jogado. **Não** é jogador novo — esse vem
    com a estrutura preenchida de zeros, e tratá-lo como conta errada acusaria o admin de erro a cada
    membro que entra antes da primeira partida. O log nomeia a persona e diz o que conferir.
  - **`report.neverRead`** lista os apelidos, e o worker emite um aviso próprio para eles. É a única
    linha do log que pede um humano: todo o resto se cura no tick seguinte.
  - **Estado `never_read`** no painel, badge "Conta errada?", primeiro na ordem de urgência da coluna
    Stats. A cópia diz exatamente o que pedir ao membro: o **EA ID**, o nome que aparece no app da
    EA, **não** o nick do clã nem a gamertag do console. Foi precisamente essa confusão que produziu
    os quatro casos.

  Por que `statsReadAt` e não `hasStats`: um membro lido com sucesso que simplesmente não jogou não
  ganha snapshot, então `hasStats` diria "nunca funcionou" sobre uma coleta que funciona.

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

  **A cadência passou de 10 para 20 min em 2026-07-28**, aplicada no schedule do serviço da
  Railway (ver Deploy > Agendamento).

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
- **Frescor depende da EA.** O gametools proxia a EA com cache de borda de ~10 min, metade da
  cadência de 20 min — é por isso que ciclos mais curtos não compravam frescor. O atraso da própria
  EA após uma partida ainda não foi medido (teste com o clã pendente, `docs/api-gametools.md` §8).

---

## Status (atualizado em 2026-07-29)

**Fases 9 a 12 planejadas em 29/07**, com escopo fechado pelo dono do projeto: perfil do membro
(bio editável, patente do jogo, XP), arsenal no perfil (3 armas, modo e mapa mais jogados), operação e
recrutamento (healthcheck, alerta de inatividade, candidatura no site), e o Discord por último. Três
ideias foram recusadas com o motivo escrito na abertura dessas fases, para não voltarem do zero:
arsenal do clã, desafios coletivos semanais e vitrine de badges.

**As Fases 9, 10 e 11 estão entregues:** bio editável no próprio perfil, patente do jogo, XP,
insígnias e dog tags, a melhor arma, o modo e o mapa mais jogados, healthcheck do ciclo, coluna de
atividade e exclusão de membro no painel, e a candidatura pelo site com fila de aprovação. **Falta a
Fase 12 (Discord)**, que tem duas decisões abertas registradas nela: canal de fórum ou bot, e dia e
horário do digest.

Pendência operacional da 11.1: o healthcheck está no código e **inerte** até o check ser criado no
serviço escolhido e a URL entrar em `HEALTHCHECK_URL` na Railway.

Duas armadilhas dessas fases só apareceram rodando ciclo real contra a fonte, e as duas parecem
plausíveis na tela: um roll-up (`gm_official`) sendo eleito "modo mais jogado" de todo o roster, e um
payload inteiro descartado por uma linha sem `name`. Ver `api-gametools.md` §13.6 e §13.7.

**Fases 0 a 6 concluídas.** O app está no ar em `fight4freedom.vercel.app`, a coleta roda no
**worker do Railway a cada 20 min** (o `pg_cron` foi desligado em 28/07), e o **roster real de 98
membros está no banco** (Fase 5). O ranking começa a contar do zero: não há histórico, e o
primeiro board com pontuação aparece quando os membros acumularem dois snapshots no mesmo mês.

**Primeiro ciclo real no Railway (28/07), e é o número que fecha a Fase 3:** 75 elegíveis varridos
em 164,9 s, `deferred: 0`, 2 rodadas, 4 lotes com 504 e **11 membros resgatados pela segunda
rodada** — 11 que numa passada só teriam ficado sem leitura. A taxa de falha da fonte segue em 16%
(4 de 25 lotes), coerente com os 14% medidos: o que mudou foi o custo dela, não a taxa. Sobrou 66%
do orçamento de 8 min.

**O código da coleta está fechado.** O que resta é operacional, e o dono do projeto decidiu em
28/07 **tratar esses itens conforme o desenvolvimento avança**, sem bloquear a Fase 7:

- **Corrigir os `platformId` pelo painel.** Dois problemas com a mesma causa, ambos com estado
  visível na coluna Stats do painel — o número exato é o que o painel mostrar, não o que está
  escrito aqui.

  **23 sem identidade EA.** A fila foi drenada com `pnpm db:resolve-identities` (roda local, e por
  isso ignora o cap por ciclo do coletor): 74 de 97 em 229 s. Reexecutar recupera falhas
  transitórias — a primeira passada deixou 30 pendentes, a segunda 23. Esses não existem na EA com o
  id que veio do export (12 `ea`, 8 `psn`, 3 `xbox`).

  **4 com identidade mas sem nenhum dado de BF6** (estado `never_read`, badge "Conta errada?").
  Consultados um a um contra a API: **sem `gm_all`, sem `classes`, `human = 0`**. Não é falha do
  coletor — o `toRawStats` devolve `null` corretamente. A busca casou com **outra conta EA de mesmo
  nome de exibição**, então apontamos para a pessoa errada. **Um resolvido:** `Bravo_six762` →
  `F4F WISLAN` (conta `xboxone`), corrigido no painel e já lido com sucesso. **Três pendentes**
  (`exposiitto`, `dusales`, `F4F Richard`): precisam do EA ID pedido ao próprio membro, porque o nome
  exibido no tracker.gg funcionou em 1 de 4 casos e não serve de fonte (`api-gametools.md` §11).

  **Custo de deixar assim, recalculado em 28/07:** era ~10 s do orçamento de 45 s da função, e essa
  aritmética morreu com a Vercel. No worker, 23 buscas que sempre falham custam ~55 s de um
  orçamento de 480 s cuja varredura leva ~165 s. Continua sendo desperdício, deixou de ser
  concorrência com o fetch — ver o cap por perfil em Deploy > Agendamento.

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
      Detalhes na Fase 5 abaixo.
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
      (board inteiro no render, revelado no cliente); lógica pura em `src/lib/stats/` e
      `src/features/clan/lib/ranking.ts`.
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
- [x] Roster real no banco: 98 membros importados em 27/07 (Fase 5), não pelo painel mas pelo
      `pnpm db:import-roster`.
- [x] **Coleta fora da Vercel (28/07):** worker no Railway a cada 20 min, cadeia removida da rota,
      `pg_cron` desligado. É o que fechou a fase — 75 elegíveis em 164,9 s, `deferred: 0`.
- [ ] Teste de fidelidade da §8 com o clã (não bloqueia a Fase 7; bloqueia divulgar as seções de
      stats).

**Próximo passo:** Fase 7. O teste de fidelidade e a correção dos ids seguem em paralelo, conforme
o desenvolvimento avança.

---

## Stack a adicionar sobre o nextjs-starter

Instalar por projeto (o starter não traz nada disso):

- **Supabase**: Postgres + Auth (Discord OAuth) + **Storage** (arte das medalhas; vídeos quando
  melhores jogadas sair do Backlog).
- **Prisma 7** (`@prisma/client` + `@prisma/adapter-pg` + `prisma`): schema em
  `prisma/schema.prisma`, aplicado com `pnpm db:push` (schema-first, sem histórico de migrations).
  URLs no `prisma.config.ts`; client com driver adapter em `src/lib/db/index.ts`.
- **Zod** + `react-hook-form` + `@hookform/resolvers` (forms do painel admin — Fase 2).
- **Recharts** (gráficos de progressão de stats — Fase 7).
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
  faltantes (cap por perfil: **10 na rota, 25 no worker**, mais uma guarda de relógio; o resto cura
  nos próximos ciclos), busca em lote, compara com o
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

**Numeração renumerada em 2026-07-28.** As etapas criadas no meio do caminho tinham número
fracionado (3.5, 3.6, 3.7), o que dava a impressão de improviso. Passaram a ser inteiras e
sequenciais. O histórico do git usa os números antigos, então a tradução é:

| Antes   | Agora   | Etapa                                    |
| ------- | ------- | ---------------------------------------- |
| 0 a 3   | 0 a 3   | inalteradas                              |
| Fase 3.5 | Fase 4 | Ranking por trabalho em equipe           |
| Fase 3.6 | Fase 5 | Roster real e ajustes do ranking         |
| Fase 3.7 | Fase 6 | Diagnóstico de sincronização no painel   |
| Fase 4  | Fase 7  | Progressão e polimento                   |

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
  7 dias, +segundos nas últimas 24 h), busca e scroll infinito de 15 em 15. O board inteiro
  vai no render e o cliente só revela por partes: paginar por offset num board que se move a
  cada coleta duplicava membros na fronteira da página (2026-07-30, ver
  `src/features/clan/lib/ranking.ts`). Pesos em `src/lib/stats/points.ts` (`POINT_WEIGHTS`) são **provisórios**
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

### Fase 3 — Coleta de stats via API gametools — todos os elegíveis a cada ciclo

_(Reescrita em 2026-07-26; o scraper do tracker.gg foi descartado — ver `docs/api-gametools.md`.)_

- ~~**Sem worker, sem Docker, sem Railway.** A coleta é uma Route Handler no próprio app
  (`/api/stats/collect`) disparada por um agendador externo.~~ **Superado em 2026-07-28:** a coleta
  virou um cron job no Railway (`worker/main.ts`, a cada 20 min) e a rota ficou como gatilho manual.
  O motivo está em Deploy > Agendamento; o teto de 60 s da função foi o que derrubou o desenho.
- **Fluxo do ciclo** (`src/lib/stats/collect.ts`):
  1. Elegíveis: `active = true` **e** `discordId` preenchido (= aceitou o convite e entrou com
     Discord — regra do ciclo de vida nas Decisões).
  2. Identidades EA faltantes são resolvidas pelo `platformId` (`GET /bf6/player/`), no máximo
     **25 por ciclo no worker** (10 na rota manual, mais a guarda de relógio — ver Deploy >
     Agendamento) — um lote grande de membros novos se resolve em poucos ciclos sem tomar o
     orçamento da varredura. Membro sem `platformId` (linha antiga) não tem o que buscar e fica
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

### Fase 4 — Ranking por trabalho em equipe: concluída (2026-07-27)

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

**Consequência que só apareceu em 28/07:** de onde o número vem está encerrado, **como ele é
exibido** não. Headshot conta bots e `kills` não, então a mesma tela pode mostrar mais headshots do
que kills (`Wislan Andrade`: 7.179 e 7.720). Correção no Backlog técnico, item 1.

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

### Fase 5 — Roster real e ajustes do ranking: concluída (2026-07-27)

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

### Fase 6 — Diagnóstico de sincronização no painel: concluída (2026-07-27)

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
"Stats pendentes" juntava os dois — são exatamente os 23 e os 5 diagnosticados na Fase 5. Abaixo do
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

### Fase 7 — Progressão e polimento

**Dividida em duas partes (28/07), e o motivo é dado, não preferência.** O histórico tem dois dias:
203 snapshots, 73 dos 99 membros com ao menos um, e **só 22 com dois ou mais**, que é o mínimo para
existir qualquer delta. Gráfico de série temporal desenha um segmento único hoje, e "membro do mês"
não tem mês para medir. Construir a segunda metade agora seria escrever código só conferível em
setembro.

#### 7.A — o que independe de histórico

- [x] **Patente viva (28/07).** Era o buraco central da fase: o `rankPoints` só era escrito pelo
      `import-roster` e pelo seed, então a escada de patentes era uma foto do site v1 e não se movia
      por mais que o membro jogasse. Agora o coletor credita, a cada snapshot gravado, os pontos do
      progresso desde o snapshot anterior (`accrueCareerPoints` em `src/lib/stats/points.ts`).
      Modelo escolhido pelo dono: **soma de todos os deltas coletados**, não soma de temporadas
      fechadas, para a patente andar dentro do mês corrente também.

      Três regras, cada uma existindo porque a alternativa produz número errado: primeira leitura
      credita **zero** (os totais de carreira foram ganhos antes de existirmos, e o saldo importado do
      v1 é o que responde por eles); leitura em conta diferente credita **zero** (subtrair carreiras
      de contas distintas rendeu 86.914 pontos para 301 minutos de jogo em 28/07); e o crédito usa
      `increment`, nunca total calculado, porque a rota manual pode rodar no meio do ciclo do worker.

      O crédito está amarrado à **inserção do snapshot**, não à leitura do membro, e é isso que o
      torna seguro contra releitura: quem foi lido e não jogou não ganha nada.

- [x] **Escada recalibrada (28/07).** Detalhes na seção própria abaixo.
- [x] **Gráfico de progressão no perfil (28/07).** Recharts via o primitivo `chart` do shadcn,
      componente em `member-progression.tsx`, seção nova no perfil e skeleton espelhando o gráfico.
      A série saiu da query para `src/features/clan/lib/progression.ts` (pura, testada), que agora
      também acumula **pontos de carreira** com a mesma regra do coletor — inclusive as duas recusas
      (primeira leitura e rebind somam zero).

      **Uma métrica por vez, e isso não é economia.** Pontos e K/D vivem em escalas incomparáveis
      (30.000 contra 2,99), então plotar juntos exigiria segundo eixo Y, que é a pior coisa que um
      gráfico pode fazer: o cruzamento das linhas passa a ser artefato das duas escalas. O botão
      pressionado nomeia a linha, então nem legenda é necessária. Área para contador cumulativo,
      linha para razão — área lê como volume acumulado, o que é verdade de um total de carreira e
      falso de uma razão.

      **Três defeitos que só apareceram olhando o gráfico renderizado**, e vale registrar porque
      nenhum deles falharia em teste: o eixo X repetia "28/07" sete vezes (a coleta roda a cada 20
      min, então o que distingue as leituras é a hora, não o dia — o formato agora depende do intervalo
      coberto); o tooltip mostrava "437" sem dizer 437 de quê (um `formatter` custom substitui a linha
      inteira, inclusive o nome); e o K/D, ajustado automaticamente, virava um precipício porque a
      variação real de 0,003 ocupava a altura toda do gráfico. Esse último era o pior: o gráfico
      afirmava um colapso onde o número praticamente não se moveu. Agora a janela mínima é de meio
      ponto de K/D, então movimento pequeno **parece** pequeno.

- [x] **Headshot em percentual (28/07).** Ver o item 1 do Backlog técnico, resolvido na exibição.
- [ ] Refino visual e animações. Sem escopo fechado: precisa de direção do dono sobre o que incomoda.

### Fase 8 — Vida no site: atividade, previsão e movimento (2026-07-28)

Etapa criada depois da 7.A, com um diagnóstico simples: o site estava **correto e
estático**. Tudo que ele mostrava era verdade e nada mudava enquanto alguém olhava, então um membro
que voltava no dia seguinte não tinha como perceber que existe um sistema rodando atrás. As três
entregas atacam isso em ordem de impacto.

#### 8.1 — Feed de atividade no painel, reativo

**Eventos são gravados, não derivados.** Tabela `clan_event`, escrita pelo coletor no mesmo ponto em
que credita os pontos. A razão é a mesma que já apareceu duas vezes neste projeto: uma promoção
existe por um instante, e quem vê os dois lados do limiar é o código que credita. Reconstruir depois
significaria subtrair deltas de um total mutável, que é exatamente o raciocínio que um dia creditou
86.914 pontos por 301 minutos de jogo.

Dois tipos, de propósito. `promotion` e `session` — um feed que lista tudo não lista nada, e com 98
membros varridos a cada 20 min "contadores mudaram" enterraria as duas coisas que interessam.

**Sessões são mescladas, não empilhadas.** Uma noite de jogo geraria uma dúzia de linhas idênticas.
Em vez disso a leitura estende a sessão aberta (janela de 90 min, que tolera quatro ciclos sem
progresso antes de decidir que a sessão acabou) e a linha cresce. É por isso que o cursor do feed é
`updatedAt` e não o id: a linha muda sem uma linha nova aparecer.

**Reatividade por polling, e isso é decisão registrada.** O componente consulta `/api/activity` a
cada 30 s, pausa com a aba escondida e dispara uma vez ao voltar para ela. As alternativas foram
pesadas: SSE morre a cada 60 s no teto da função da Vercel, então reconectaria em loop — um polling
com mais peças; e Supabase Realtime é push de verdade, mas exige publicar a tabela e conceder SELECT
anônimo nela, ou seja, um caminho de leitura pública novo no banco para um feed cujo produtor é um
cron de 20 minutos. Contra essa cadência, 30 s já é mais rápido do que o dado muda. **Caminho de
upgrade:** Realtime, e o gatilho para tomá-lo é a cadência cair para segundos.

Só linhas que mudaram piscam: payload idêntico é no-op, e a maioria dos polls é (30 s contra 20 min).
O merge é função pura (`lib/activity.ts`), então isso é teste e não inspeção visual.

**Fica na visão geral do painel, e só lá** (decisão do dono, 29/07). Nasceu na home, embaixo do hero,
e saiu de lá: é informação operacional, não conteúdo de vitrine. No painel ele acumula uma segunda
função que a home não dava — é o monitor mais próximo que temos da coleta. Linha nova aparecendo
significa que o worker rodou e creditou, sem abrir log da Railway.

A visão geral foi reorganizada no mesmo passo: os sete cards viraram **quatro**, em grid responsivo, e
nenhum número foi perdido — os que ficaram sem card viraram hint do card a que pertencem. Sete cards
em três colunas deixavam uma linha órfã de um e davam o mesmo peso visual a "Administradores" (muda
uma vez por ano) e a "Membros". Os botões de ação subiram para o header, ao lado do título.

#### 8.2 — Previsão da próxima patente no perfil

"Faltam 12.000 pts para Major, cerca de 80 h no seu ritmo." Duas regras sustentam a honestidade da
conta:

- **Ritmo do próprio membro na frente da calibração do clã.** Um Suporte que joga objetivo pontua
  diferente de um fragger, e dar o mesmo número aos dois torna a previsão decorativa.
- **Dizer qual base foi usada.** Previsão na média do clã é uma afirmação diferente de previsão no
  ritmo medido do membro, e quem não distingue as duas não pode julgar nenhuma.

A armadilha que o teste trava: as horas da série são **horas de carreira**, então dividir pontos
coletados por horas de carreira daria ritmo perto de zero para todo veterano e previsão em décadas.
Numerador e denominador saem da mesma janela.

Fica em bloco próprio e não dentro do hover do `RankCard`: hover não existe em toque, que é a maior
parte do clã, e meta que precisa ser descoberta com o mouse não é meta.

#### 8.3 — Setas de variação no ranking

`previousRank` no `RankingEntry`: o mesmo board, pontuado como estava no início da janela, mesmos
membros e mesmas regras, só retendo os snapshots depois do corte.

**Janela de 3 h, medida e não escolhida (29/07).** A primeira versão usou 24 h e o dono achou demais.
Antes de trocar por palpite, medimos as candidatas contra o board real, com 26 membros pontuando:

| Janela             | Setas | Média de posições | Maior salto |
| ------------------ | ----: | ----------------: | ----------: |
| Último ciclo       |     0 |                 0 |           0 |
| 20 min             |     0 |                 0 |           0 |
| 1 h                |     7 |               1,4 |           2 |
| **3 h**            |    21 |               2,5 |          10 |
| 6 h                |    19 |               4,2 |           8 |
| 24 h               |    16 |               6,4 |          12 |

**Por que não a cadência da coleta, que era a intuição inicial:** ganhar pontos num ciclo de 20 min
quase nunca troca posição — vizinhos nesse board estão a centenas de pontos e uma sessão de 20 min
vale ~50 — então a janela não produz seta nenhuma. Pior, ela faria a seta desaparecer no ciclo
seguinte, escondendo uma subida que aconteceu de verdade; e janela igual à cadência cai na fronteira
do ciclo, então o último snapshot entra ou sai do corte conforme o instante em que a página renderiza.

O que **já** acompanha os 20 min é o board: a tag `stats` é purgada a cada ciclo, então posições e
pontos são sempre do último. A janela é outro eixo — contra o que comparar, não quão fresco é o dado.

**Posição final: inline, depois do nome do membro** (29/07). Duas tentativas anteriores e o que cada
uma ensinou. Embaixo do índice num flex column: os dois dividiam a mesma caixa, então a caixa crescia
quando havia seta e o número centralizado ficava mais alto que nas linhas sem seta — board com os
números desalinhados. Embaixo do índice em `absolute`: alinhou (offset de 15 px medido em todas as
linhas), mas o rótulo pendia na borda inferior da linha. Na linha do nome não há caixa para crescer nem
borda para invadir, e o `truncate` mudou de lugar: fica no span do apelido, não na linha, senão um
nome longo empurraria a seta para fora — justamente a parte que muda entre visitas.

Três decisões que valem registro:

- **`new Date()` dentro da query cacheada, e não na chave.** A chave segue sendo o mês. O relógio
  afeta o valor, limitado por dois lados: o TTL de 300 s e a tag `stats`, que toda coleta purga. Uma
  janela "desde ontem" derivando alguns minutos não é defeito; chave de cache volátil seria.
- **Seta exige posição real nas duas pontas.** Membro com zero pontos no mês não recebe seta: a
  posição dele é o desempate alfabético, e pintar vermelho porque alguém acima jogou seria culpá-lo
  pela sessão de outro. E quem tinha zero pontos **24 h atrás** também não recebe, porque a primeira
  sessão do mês é entrada no board, não ultrapassagem. Sem essa segunda metade, o board de 29/07
  exibia +80, +64, +53 e +42 ao mesmo tempo, o que parece ranking em convulsão quando era quatro
  pessoas começando a jogar.
- **Direção não fica só na cor.** Verde e vermelho é exatamente o par que o leitor com daltonismo não
  separa, então vai seta, número e texto para leitor de tela.

#### 7.B — depende de um mês real (a partir do fim de agosto)

- [ ] "Membro do mês" e conquistas automáticas sugeridas a partir de deltas.
- [ ] Tendência mensal no ranking, que só faz sentido com temporadas fechadas em série.
- [ ] Revisão do `POINT_WEIGHTS` (item 3 do Backlog técnico) — e, junto dela, o reescalonamento da
      escada, porque as duas coisas estão amarradas.

#### 8.4 — Frescor sem recarregar (`RefreshOnFocus`)

As páginas da vitrine são `force-dynamic`, então **toda requisição** recebe dado fresco. O que não
existia era canal para uma página **já aberta**: o payload RSC é entregue uma vez, então quem deixou
o `/ranking` aberto durante um ciclo lia um board de vinte minutos atrás, e o único sinal era o
contador "Encerra em" andando ao lado de números congelados.

`RefreshOnFocus` (em `src/components/`, genérico) chama `router.refresh()` quando o visitante volta
para a aba. `router.refresh()` e não fetch próprio: ele reexecuta a página no servidor, o que
recalcula as queries cacheadas que o coletor purgou, e troca o resultado sem perder scroll nem estado
de cliente. O componente não sabe o que é ranking, então serve qualquer página — está montado em
`/ranking` e em `/membros/[id]`.

**Não é polling.** Dispara ao voltar para a aba, com piso de 30 s entre execuções, então aba de lado
não custa nada. Dois eventos porque respondem perguntas diferentes: `visibilitychange` cobre troca de
aba e `focus` cobre troca de **janela**, onde a aba continua "visible" e o primeiro nunca dispara.

Atualização ao vivo enquanto a pessoa olha é outra feature, e a ferramenta honesta para ela é canal de
push (item 8 do Backlog técnico).

#### Calibração da escada de patentes (2026-07-28)

**O problema:** os limiares eram provisórios e nunca calibrados. Marechal custava 20.000 pontos.

**A constante:** 150 pontos por hora de jogo, **medida, não estimada**. Nos dois dias coletados o
roster jogou 66,8 h e ganhou 9.957 pontos, o que dá 149 pts/h; a mediana das carreiras dá 156. A
unidade que torna a escada auditável é **hora jogada**: todo limiar é `horas × 150`.

**O que a escada antiga produzia**, no ritmo medido:

| Perfil                              | Chegava a Marechal em |
| ----------------------------------- | --------------------- |
| Casual, 8 h/mês                     | 16,7 meses            |
| Regular, 25 h/mês                   | 5,3 meses             |
| Ativo, 50 h/mês                     | **2,7 meses**         |
| Hardcore, 100 h/mês                 | **1,3 mês**           |
| Outlier medido (165 h/mês)          | **24 dias**           |

O outlier não é hipótese: um membro jogou 11 h nos dois dias coletados.

**A escada nova**, aprovada com teto de 240.000 pontos (1.600 h):

| Patente             |   Pontos | Horas | Regular (25 h/mês) | Ativo (50 h/mês) | Hardcore (100 h/mês) |
| ------------------- | -------: | ----: | ------------------ | ---------------- | -------------------- |
| Soldado             |        0 |     0 | -                  | -                | -                    |
| Cabo                |      750 |     5 | 6 d                | 3 d              | 2 d                  |
| Terceiro-Sargento   |    2.000 |    13 | 16 d               | 8 d              | 4 d                  |
| Segundo-Sargento    |    4.500 |    30 | 1,2 m              | 18 d             | 9 d                  |
| Primeiro-Sargento   |    8.000 |    53 | 2,1 m              | 1,1 m            | 16 d                 |
| Subtenente          |   13.000 |    87 | 3,5 m              | 1,7 m            | 26 d                 |
| Segundo-Tenente     |   20.000 |   133 | 5,3 m              | 2,7 m            | 1,3 m                |
| Primeiro-Tenente    |   30.000 |   200 | 8,0 m              | 4,0 m            | 2,0 m                |
| Capitão             |   42.000 |   280 | 11,2 m             | 5,6 m            | 2,8 m                |
| Major               |   55.000 |   367 | 14,7 m             | 7,3 m            | 3,7 m                |
| Tenente-Coronel     |   75.000 |   500 | 20,0 m             | 10,0 m           | 5,0 m                |
| Coronel             |  100.000 |   667 | 2,2 anos           | 13,3 m           | 6,7 m                |
| General de Brigada  |  125.000 |   833 | 2,8 anos           | 16,7 m           | 8,3 m                |
| General de Divisão  |  155.000 | 1.033 | 3,4 anos           | 20,7 m           | 10,3 m               |
| General de Exército |  190.000 | 1.267 | 4,2 anos           | 2,1 anos         | 12,7 m               |
| **Marechal**        |  240.000 | 1.600 | **5,3 anos**       | **2,7 anos**     | **16 meses**         |

Três âncoras que sustentam esses números:

1. **Depois de dois meses**, que era o critério do dono, o roster se espalha de Terceiro-Sargento
   (casual) a Capitão (o outlier). Ninguém perto do topo.
2. **A carreira inteira do membro mais antigo não chega a Marechal.** O maior total de horas do roster
   é 814 h, que valeria 122.100 pontos, ou seja General de Brigada. O topo é objetivo de anos.
3. **A primeira promoção sai em horas.** Cabo a 5 h é o único lugar da escada onde velocidade importa,
   porque é onde o membro decide se a coisa mede algo.

**Acoplamento a registrar:** os limiares são pontos, então retunar o `POINT_WEIGHTS` muda os pontos
por hora e **obriga** a reescalar a escada pelo mesmo fator. Sem isso, a dificuldade muda sem ninguém
tocar em `ranks.ts`. O aviso está no cabeçalho do arquivo e há teste afirmando a ordem de grandeza.

**Migração dos saldos: `pnpm db:rebase-ranks`.** O `rankPoints` importado foi escrito na escala
antiga (Capitão = 2.500), então subir os limiares novos sem converter rebaixaria 57 dos 99 membros. O
script lê a patente que o saldo atual sustenta na escada **antiga** (congelada dentro dele, de
propósito) e grava o limiar novo da **mesma** patente, preservando o excedente já creditado. Ninguém
sobe, ninguém desce, só a escala muda. Dry run por padrão.

Ordem obrigatória: **deploy primeiro, script depois.** As duas ordens exibem estado errado nos
minutos intermediários, e essa é a direção inofensiva — a vitrine mostra patente mais baixa por
alguns minutos. Rodar o script antes mostraria **todo mundo como Marechal** na escada antiga, que é a
versão que vira captura de tela. O script roda **uma vez**: uma segunda passada leria o saldo já
convertido contra a escada antiga e inflaria tudo de novo, e é isso que a guarda dele detecta.

---

### Fases 9 a 12 — planejadas em 2026-07-29

Levantadas a partir do Backlog de produto, com escopo fechado pelo dono do projeto em 29/07. Quatro
fases, e a ordem tem motivo: **o Discord é a última** porque é a única que depende de decisão externa
ao código (canal de fórum ou bot, ver 12.3) e a única que é puro anúncio. Anunciar primeiro e ter
conteúdo depois é a ordem que produz um canal falando de um site que não mudou.

> **9, 10 e 11 entregues em 29/07; falta a 12.** O estado corrente e as pendências operacionais ficam
> em Status, no topo do arquivo, e não repetidos aqui — duas contagens de "o que está pronto" divergem
> na primeira vez que alguém atualiza só uma.

O que sustenta as três primeiras: uma sondagem da fonte feita em 29/07 e registrada em
`api-gametools.md` §13. O achado que muda o dimensionamento é que o payload que **já baixamos** tem
721 KB por jogador e carrega `weapons[53]`, `maps[18]`, `gameModes[16]`, `vehicles[22]`, `gadgets[43]`
e `XP`. Arsenal e XP no perfil custam **zero requisição nova**.

Escopo recusado na mesma conversa, para não ser rediscutido do zero:

- **Arsenal do clã** (página agregada com a "meta do clã"). Descartado por ora. A tabela da Fase 10 NÃO
  serve: ela guarda um item por tipo por membro, então qualquer soma sobre ela é enviesada para o que já
  é popular. Um agregado do clã precisa da coleta completa dos 152 itens.
- **Desafios coletivos semanais.** Descartado por ora.
- **Vitrine de badges e dog tags.** Reduzido a três contadores dentro da 9.2, e o motivo é a fonte:
  ela devolve `badges: 104` e `totalDogTags: 39` como **números**, não como lista. Varremos os 18
  endpoints BF6 do openapi em 29/07 e nenhum lista badge individual, então esse item não tem como
  crescer depois sem alimentação manual. Feito com o que existe ou não feito.

### Fase 9 — O perfil como página do membro

O perfil hoje é um retrato gerado por nós: o membro não escreve nada nele e não reconhece nada dele
como seu. Duas mudanças, uma de cada lado.

#### 9.1 — Bio editável pelo próprio membro: entregue (2026-07-29)

**Escopo, fechado em 29/07: só a `bio`.** Nada além disso. A coluna já existia em
`prisma/schema.prisma` desde a Fase 0, com comentário escrito, e **não era lida nem escrita em lugar
nenhum do código**. Esta fase é a leitura e a escrita que faltavam, sem coluna nova.

**Edição no lugar, dentro de `/membros/[id]`.** A bio fica abaixo do nick e da plataforma, no header
do perfil, ocupando 100% da largura da coluna. Quem é o dono vê borda tracejada no hover, que é o
convite para clicar; clicar troca por um campo com dois botões de ícone de 32 px (✓ e ✕) à direita. Bio
vazia mostra "Adicione uma bio" **só para o dono**.

**O desenho é mínimo por exigência, e a exigência tem um número.** O pedido foi "o menor possível" e
"evite crescer o card header". Isso é atingível porque os cards de patente e classe ao lado têm 153 px
fixos e são eles que definem a altura do header, então a coluna do meio tem folga embaixo deles.
Medido a 1280 px num perfil real em 29/07, com a coluna da bio em 526 px:

| Estado                  | Coluna do meio | Header     |
| ----------------------- | -------------: | ---------- |
| sem bio                 |          76 px | **219 px** |
| leitura, 280 caracteres |         146 px | **219 px** |
| leitura, 10 quebras     |         146 px | **219 px** |
| edição, 280 caracteres  |         124 px | **219 px** |
| edição, com erro        |         148 px | **219 px** |

O header **não mexe em estado nenhum**, incluindo o de erro. Três escolhas sustentam isso e não podem
ser relaxadas sem medir de novo:

- **`line-clamp-3`.** Em `text-sm` dentro de 526 px, 280 caracteres quebram em quatro linhas, e quatro
  linhas mediram 166 px de coluna, empurrando o header para 232 px. Três linhas dão 146 px e seguram.
  O clamp também é a única defesa contra bio curta cheia de quebra de linha: 10 quebras mediram 286 px
  sem clamp. Aparecem ~255 dos 280 caracteres, e clicar mostra o resto.
- **`text-sm`, e não mais que isso.** A subida de `text-xs` custou 13 px de header sozinha, até o clamp
  absorver. Não sobrou espaço para outro passo.
- **Os botões ao lado do campo, em fileira.** A 32 px são mais baixos que os 48 px do campo, então não
  somam altura. Numa fileira embaixo, somariam.

O contador "5/280 caracteres. Texto simples, sem links" foi removido: o cap virou silencioso e a regra
de link só aparece como erro depois de tentar salvar.

**Armadilha do método de medição**, para a próxima vez: o Tailwind v4 só emite classe que encontra no
código, então medir um valor de clamp que não está no arquivo mede **clamp nenhum**, não o valor
pedido. A primeira tentativa com `line-clamp-3` deu 286 px porque a classe não existia no CSS
compilado.

A primeira versão era uma rota `/perfil` separada, e foi descartada no mesmo dia pelo dono do
projeto. O motivo vale registrar porque vale para qualquer autosserviço futuro deste site: uma tela de
configuração exige que alguém saiba que existe uma segunda URL, e quase todo mundo aqui chega por link
do Discord direto no perfil. Editar onde se lê elimina esse passo. Custo da troca: o componente virou
Client Component dentro de uma página pública, então a página passou a receber `canEdit`.

**Decisões:**

- **Só a bio.** `nickname`, `eaName`, `platform` e as duas ids da EA continuam sendo escrita de admin.
  São chaves de coleta e de identidade: quem confirmou a conta não pode se desvincular sozinho, que é
  a regra da §12 do estudo da API.
- **Nem admin edita a bio de outro.** Diferente da progressão, que admin vê no perfil de qualquer um,
  porque ali é leitura. Aqui é escrita, e admin editando a bio de um membro na página pública está
  pondo frase na boca dele. Conserto de dado é no painel.
- **Texto puro, sem markup e sem link.** React já escapa, então o risco não é XSS, é social: campo
  público de texto livre num clã que recebe membro toda semana é convite a spam. O padrão pega
  `http://`, `https://` e `www.`, e um `meusite.com` cru passa. É quebra-molas, não filtro: padrão
  rígido o bastante para pegar todo domínio começa a recusar frase normal. Tem teste travando isso.
- **Avatar continua vindo do Discord**, capturado no convite. Upload significaria storage, moderação e
  um caminho de abuso novo para ganhar zero.
- **`useTransition`, não `useActionState`.** O editor tem que fechar quando o save entra e continuar
  aberto quando é recusado. Com `useActionState` isso viraria `setState` dentro de efeito, que o ESLint
  do projeto recusa (`react-hooks/set-state-in-effect`) e que se lê como reação a mudança de estado em
  vez de reação ao evento que a causou. Aguardar a action dentro da transition põe a decisão no ponto
  do save.

**Armadilha, e é a que precisa estar escrita:** esta é a **primeira escrita em `member` feita por
alguém que não é admin**. A RLS está ligada em toda tabela desde 29/07, mas as escritas do app passam
pelo Prisma com credencial privilegiada, então **a RLS não é a guarda aqui**. A guarda é a Server
Action, via `requireOwnMemberId()` (`src/lib/auth/session.ts`), que tira o membro da **sessão** e nunca
de prop nem de form. Quem ler só o schema vai supor o contrário. O `canEdit` da página decide apenas o
que renderiza.

**Segunda armadilha:** a action tem que chamar `revalidateVitrine(CACHE_TAG.members)`. Sem isso a
edição espera os 300 s de TTL para aparecer para os outros, que é metade dos "editei e não mudou" do
item 7 do Backlog técnico. Sem `revalidatePath` junto: `/membros/[id]` é `force-dynamic`, então não há
cache de página para descartar, e quem editou lê o próprio valor do retorno da action.

**Onde ficou:** `src/features/profile/` (`lib/schemas.ts`, `lib/actions.ts`,
`components/member-bio.tsx`), mais `bio` em `MemberProfile` e o `canEditBio` na página. O `textarea` do
shadcn entrou no projeto por causa disto.

**Verificado:** `lint`, `type-check`, `build` e 493 testes passando, 23 deles novos (schema, componente
nos dois papéis, e as quatro combinações de quem está olhando). **Não verificado:** o ciclo real contra
o Supabase, só coberto por teste com a action mockada.

#### 9.2 — Patente do jogo, XP, badges e dog tags: entregue (2026-07-29)

O que o membro reconhece como seu vem do jogo, não da nossa escada.

**Onde cada coisa aparece, fechado com o dono em 29/07:**

- **Patente do jogo:** no painel de uma coluna **acima** dos tiles de estatística, em `/membros/[id]`,
  e só ali. O card do header segue com a patente do **clã**.
- **Insígnias, dog tags e XP:** tiles no grid comum de estatísticas.
- **Divisão ranked do Redsec:** também no grid, mas **só quando existe**.

**Duas origens, e é isso que define o desenho:**

| Dado                                                                       | Origem                                  | Custo                       |
| -------------------------------------------------------------------------- | --------------------------------------- | --------------------------- |
| `XP.total`, `XP.performance`, `XP.accolades`                               | payload de **stats**, já baixado        | zero requisição             |
| `rankName`, `playerCard.rank`, `rankImage`, `badges`, `totalDogTags`, `competitiveRanks` | `GET /bf6/profile/`, uma por membro | 1 requisição por membro     |

**Schema:**

```prisma
// stat_snapshot — contadores monotônicos, mesmo tratamento dos outros
xpTotal       Int @default(0) @map("xp_total")
xpPerformance Int @default(0) @map("xp_performance")
xpAccolades   Int @default(0) @map("xp_accolades")

// member — estado atual, baixa rotatividade
gameRankName        String?   @map("game_rank_name")
gameRankLevel       Int?      @map("game_rank_level")
gameRankImageUrl    String?   @map("game_rank_image_url")
badgeCount          Int?      @map("badge_count")
dogTagCount         Int?      @map("dog_tag_count")
competitiveRankName String?   @map("competitive_rank_name")
competitiveRankMode String?   @map("competitive_rank_mode")
gameProfileReadAt   DateTime? @map("game_profile_read_at") @db.Timestamptz(6)
```

**Decisões:**

- **XP como coluna do snapshot, não em `extra`.** O perfil lê o snapshot mais recente em toda
  renderização, e jsonb significaria parsing por linha. De brinde, XP vira um segundo gráfico de
  progressão sem trabalho novo.
- **XP nunca pontua.** Só exibe. Nossa escada é calibrada em trabalho em equipe (150 pts/h medidos) e
  o XP do jogo remunera tempo e desempenho individual. Alimentar `rankPoints` com XP desmontaria a
  decisão de 27/07 sem ninguém decidir isso.
- **Patente do jogo em `member`, não em snapshot.** É estado atual e muda a cada dezenas de horas.
  Série temporal de um valor que quase não anda é linha desperdiçada.
- **Cadência da chamada de profile: 10 membros por ciclo**, fila por `gameProfileReadAt` ascendente.
  98 membros dão 10 ciclos, cerca de 3h20 para atualizar todo mundo. Sem cron novo, e reusa
  exatamente o padrão de fila do `statsCheckedAt`, que é o único que provou rotacionar (ver "Fila da
  coleta: a armadilha do indicador que não avança").
- **A passada roda por ÚLTIMO no ciclo, com 95% do orçamento como teto.** Ela só gasta o que a
  varredura deixou. Num ciclo em que a fonte está lenta, o resultado certo é todo mundo com stats
  lidos e ninguém com insígnia atualizada.
- **`gameProfileReadAt` é estampado em TODA tentativa, com ou sem sucesso.** É a linha que mantém a
  fila girando: quem falha sempre ficaria com o timestamp mais antigo para sempre e seria repescado
  todo ciclo, deixando os outros 88 sem vez. É exatamente a forma do bug que congelou a resolução de
  identidade por 21 ciclos seguidos em 28/07.
- **Os campos do perfil, ao contrário, só são escritos no sucesso.** `fetchGameProfile` não distingue
  "a requisição morreu" de "essa conta não tem patente", então gravar os nulos dele apagaria uma
  patente boa numa tarde ruim. Um sucesso, sim, é autoritativo: se a divisão sumiu, o tile sai.
- **"Unranked" é normalizado para nulo em vez de armazenado.** É a resposta para quase todo o roster, e
  divisão só vale tile quando existe. O que distingue "não tem" de "nunca perguntamos" é o
  `gameProfileReadAt`.
- **Falha do profile nunca afeta o snapshot.** `try/catch` próprio, dentro e fora do laço. Os
  snapshots já estão gravados quando essa passada roda: um refresh cosmético não pode derrubar um
  ciclo cujo produto já entrou.
- **O card do header ficou com a patente do CLÃ** (decisão revista em 29/07, depois de ver na tela). A
  primeira versão trocava uma pela outra ali, e a troca deixava o perfil público sem a única escada em
  que o clã compete. A patente do jogo passou para o painel acima dos tiles, onde tem largura e não
  disputa espaço com a nossa.
- **Tile de ranked só quando há divisão; os outros três aparecem com "—".** A diferença é o tempo de
  vida do vazio: insígnias e XP entram em horas, então um tile que aparece e desaparece leria como
  bug; ranked é nicho e provavelmente nunca vai existir para a maioria.

**A tolerância que abre exceção no parser, e ela é assimétrica de propósito:** o schema do coletor é
estrito porque contador faltando significa pular o membro e retentar (snapshot com buraco corrompe o
delta do mês para sempre). O XP é o **único campo tolerante**: ele não pontua e só é exibido, então
perder um lote inteiro por um bloco de XP ausente trocaria dado real por cosmético. Ausente cai para
zero, e zero é lido como "desconhecido", nunca como conta sem XP.

**Armadilha do payload de profile**, já documentada na §12: `stats` é lista plana com nomes repetidos
(339 entradas, 268 nomes distintos), então somar triplica valor. Usar `profileStat()`. E entrada sem a
chave `value` significa desconhecido, nunca zero.

**Segunda armadilha, e essa é nova:** `XP` vem como **array de um elemento**, não como objeto. Parser
escrito de memória lê `undefined` em produção e passa nos testes. Está fixado no fixture.

**Nada a fazer em `next.config.ts`:** `cdn.gametools.network/ranks/**` já estava liberado pela tela de
confirmação de identidade, e a arte da patente vem desse mesmo caminho.

**Onde ficou:** `GameProfile` e `fetchGameProfile` no `StatsProvider`; `toGameProfile` em
`stats/gametools.ts` (fonte única de onde a patente mora, lida também pelo `toIdentityCard`);
`readGameProfiles` em `stats/collect.ts`; `GameRankCard` em `features/clan/components/`; os tiles em
`PlayerStats` via a prop `game`; `formatCompactNumber` em `lib/format.ts` (XP tem oito dígitos e não
cabe num tile).

**Verificado:** `lint`, `type-check`, `build` e 518 testes passando, 24 deles novos. **Não
verificado:** um ciclo real contra a fonte, e o `pnpm db:push` que cria as colunas.

### Fase 10 — Melhor arma, modo e mapa no perfil: entregue (2026-07-29)

**Escopo, fechado em 29/07:** **uma** arma (a melhor), **um** modo (o mais jogado) e **um** mapa (o mais
jogado). Três itens por membro, nada além. A versão anterior do plano previa 3 armas, e o corte para uma
veio na mesma conversa.

Elas aparecem como linhas do painel de uma coluna que a 9.2 abriu acima dos tiles, junto do nível no BF6.

Esse recorte é o que torna a fase barata, e a aritmética é a decisão. O payload traz 152 linhas de
detalhe por membro por leitura (53 armas, 43 gadgets, 22 veículos, 18 mapas, 16 modos). Com 98 membros
e 72 ciclos por dia:

| Estratégia                   | Linhas por dia | Total estável |
| ---------------------------- | -------------: | ------------- |
| Histórico por leitura        |     ~1.070.000 | inviável      |
| Estado atual dos 152 itens   |              0 | ~15.000       |
| **Estado atual do topo (3)** |              0 | **~294**      |

Medido depois de entregar: **216 linhas** para os 72 membros que a coleta lê hoje.

**Decisão: estado atual, por upsert.** Sem histórico, mesmo raciocínio do `stat_snapshot`.

**O que torna guardar menos seguro:** a fonte devolve **totais vitalícios idempotentes**. Se um dia o
clã quiser top 3 de armas, volta a coluna `rank`, muda a constante, e o ciclo seguinte preenche. Não
existe dado perdido, porque nada aqui depende de diferença entre leituras.

**Schema:** enum `TopItemKind { weapon, gamemode, map }` e o model `MemberTopItem`, com
`@@unique([memberId, kind])`. **Sem coluna `rank`**, e é isso que o escopo de um item por tipo compra:
a linha significa "a melhor arma deste membro", então o `itemId` muda dentro dela quando a favorita
muda, e nenhum upsert consegue fazer a tabela crescer. Querer um top 3 é exatamente o que traria o
`rank` de volta.

**Decisões:**

- **Arma ordenada por kills; modo e mapa por tempo jogado.** Arma é escolha de ferramenta, e "aquela com
  que eu mato" é o que o membro chama de melhor. Mapa e modo são onde ele passa as noites, e escolher
  por vitórias reportaria aquele em que ele teve uma noite boa. Mesmo raciocínio do `bestClassByKitTime`.
- **Zero não ganha.** Conta que nunca atirou não gera linha de arma, em vez de uma arbitrária entre 53
  empates em zero.
- **Escrito para todo membro LIDO, não só para quem jogou.** Diferente do snapshot: são estado atual, e
  o membro que não jogou tem os mesmos itens de destaque de ontem. Por isso a tabela se preenche num
  ciclo, não conforme as pessoas voltam a jogar.
- **A arte de modo é descartada na coleta.** É SVG (`/modes/bf6/escalation.svg`), e servir SVG de
  terceiro pelo otimizador do Next exige `dangerouslyAllowSVG`, que aceita script dentro de um arquivo
  que não controlamos. Descartada na origem, não ignorada no componente, para nada a jusante ser
  tentado a renderizar. A linha usa ícone nosso. `next.config.ts` liberou só `/weapons/**` e `/maps/**`.
- **Kind ausente não apaga o que já sabemos.** A fonte às vezes serve payload parcialmente zerado
  (`isIncoherentPayload`), então lista vazia mantém a linha anterior.

**A armadilha que CHEGOU EM PRODUÇÃO, e é a lição da fase:** o primeiro ciclo real reportou **"Official"
como o modo mais jogado dos 68 membros** que leu. `gm_official` é um roll-up de todos os modos oficiais,
com 725.434 s contra os 745.876 s do `gm_all`: a conta inteira com nome de modo. Filtrar o nome literal
`"All"` não pegava.

O que isso ensina, além do filtro: **um agregado sempre ganha uma comparação de "mais jogado", e a
escolha errada é invisível porque parece perfeitamente plausível.** A tabela completa dos 16 modos, com
os três roll-ups identificados, está em `api-gametools.md` §13.6. As 68 linhas erradas foram apagadas e
refeitas no ciclo seguinte, porque estado atual é descartável por construção.

**Segunda armadilha, também só visível em produção:** o `/bf6/profile/` devolve entrada de `stats[]
**sem a chave `name`**, e o schema estrito descartava o payload inteiro por causa de 1 linha em 339. Isso
derrubou os 11 perfis do segundo ciclo e, de quebra, vinha derrubando em silêncio o card de
`/confirmar-conta`. Detalhes em §13.7.

**Terceira armadilha, essa prevista: as kills de arma estão num quarto recorte.** `weaponGroups[All]` dá
13.213 contra as 12.320 humanas que o perfil exibe e os 13.695 do bucket de classes. A soma das armas
não fecha com o tile de Kills ao lado. Saída adotada, a mesma do percentual de headshot de 28/07:
declarar o recorte em vez de esconder o número, com precisão e tempo de uso em destaque.

**Layout, fechado depois de ver na tela (29/07): a seção Estatísticas é um grid de DUAS COLUNAS lado a
lado.** A da esquerda tem largura máxima de 20rem e leva o que o membro joga (nível no BF6, arma, modo,
mapa); a da direita leva os contadores num grid de 3 colunas. A divisão vale de `lg` para cima: abaixo
disso as duas empilham, porque 20rem mais um grid de 3 colunas não cabe num tablet.

Cada item é uma linha, com arte à esquerda, nome e rótulo no meio, e os números à direita. Arma reporta
kills e precisão; mapa e modo reportam horas e aproveitamento, e o aproveitamento só aparece quando há
partidas para dividir (senão seria "NaN%" ou um 0% plausível). A ordem das linhas é fixa (arma, modo,
mapa) e não ordenada: elas respondem três perguntas diferentes, então ranquear uma contra a outra não
significaria nada.

**`pnpm db:sync-game-profiles`, e por que ele teve de existir.** O cap de 10 perfis por ciclo é certo no
regime estável e péssimo no dia em que a feature sobe: três ciclos reais deixaram **9 de 99 membros** com
patente, então o painel ficava vazio para 90% do roster e parecia defeito. O script varre todos sem
orçamento, igual ao `db:resolve-identities`, e por isso mora ao lado dele. Três passadas levaram a
cobertura a **60 de 72 elegíveis**; os 12 restantes seguem em timeout na fonte e o coletor continua
tentando.

Uma armadilha de relatório que o script trouxe e vale para qualquer script novo: `fetchGameProfile`
**captura o próprio timeout e devolve null** em vez de lançar, então contar apenas o `catch` reportou
"0 falhas" numa passada que perdeu 17 membros. O número é o motivo para rodar de novo, então ele tem de
ser verdadeiro.

**Verificado com dado real, e é o que fechou a fase:** três ciclos reais em 29/07. O último leu 72
membros, gravou 216 linhas (72 por tipo), zero com id agregado, com modos reais (Conquest, Escalation) e
patentes reais chegando (nível 187, 109 insígnias). `lint`, `type-check`, `build` e **561 testes**
passando.

**Não verificado:** o ciclo com a fonte saudável. As três execuções pegaram a API degradada (muitos 504),
e numa delas a varredura consumiu os 480 s inteiros e a guarda de relógio pulou a passada de perfil, o
que é o comportamento correto e ainda assim significa que o caminho rápido não foi exercitado.

### Fase 11 — Operação e recrutamento

Nada nesta fase aparece na vitrine. As três são para quem opera o clã.

**A Fase 11 está entregue por inteiro.** A 11.2 saiu primeiro, fora de ordem, porque o dono do projeto
foi procurar a informação no painel e ela não estava lá.

#### 11.1 — Healthcheck do ciclo: entregue (2026-07-29)

**O que isto pega e nada mais pegava.** A Fase 6 tornou a falha visível **dentro** de um ciclo: o painel
diz quem não foi lido e por quê. Ninguém vigiava **entre** ciclos. Se o container da Railway não subir, ou
o processo morrer antes de escrever, não há log para ler nem linha para notar, e o sintoma aparece dias
depois como "os números pararam de andar".

**Por que serviço de fora, e não tabela nossa.** Tabela só registra execução que aconteceu. A falha que
vale pegar é a que **não** aconteceu, e nada dentro do processo consegue reportar a própria ausência. Quem
detecta silêncio tem de estar fora do que está silencioso.

**Três pings, na convenção que healthchecks.io, Better Stack e cron-job.org entendem sem adaptador:**

| Momento | Path      | Por quê                                                            |
| ------- | --------- | ------------------------------------------------------------------ |
| início  | `/start`  | abre a janela que o monitor mede, antes de qualquer trabalho       |
| sucesso | (raiz)    | **depois da purga de cache**, ver abaixo                           |
| falha   | `/fail`   | separa "rodou e quebrou" de "não rodou", que têm correções diferentes |

**Decisões:**

- **O ping de sucesso é a ÚLTIMA coisa do ciclo**, depois da purga. Antes dela, reportaria sucesso de um
  ciclo que ainda pode falhar no passo final, e o monitor ficaria calado exatamente sobre a falha que ele
  existe para ver.
- **O ping de falha é aguardado antes do `process.exit`.** `exit` não espera promise em voo, então pingar
  sem await abandonaria a requisição e transformaria uma quebra no outro modo de falha do monitor: o
  silêncio, que ele acabaria reportando como "nunca rodou".
- **Nunca fatal, nas duas direções.** Um healthcheck capaz de derrubar um ciclo inverte o próprio
  propósito: o monitor passa a ser a indisponibilidade. Toda função engole tudo.
- **`HEALTHCHECK_URL` é opcional**, e é a única env assim. Monitoramento não pode ser requisito para
  coletar: execução local e CI não têm monitor, e o ciclo tem de se comportar igual com e sem um.
- **O resumo vai no corpo do ping.** Os serviços guardam e exibem ao lado da execução, então o histórico
  de alertas passa a responder "quantos membros cada um dos últimos vinte ciclos atualizou" de graça, sem
  tabela nossa. É a mesma string do log, montada uma vez, porque duas iriam divergir e a do histórico é a
  que ninguém está por perto para re-derivar.
- **Barra final tolerada** na URL configurada: URL de monitor colada à mão carrega uma metade das vezes, e
  `//start` é 404 em todo serviço que fala essa convenção.

**Onde ficou:** `src/lib/ops/healthcheck.ts`, `healthcheckUrl` em `lib/env.ts`, e três chamadas em
`worker/main.ts`.

**Verificado:** 7 testes cobrindo os três paths, o corpo, a barra final, a ausência de configuração e o
monitor inalcançável. **Não verificado:** um alerta real disparando — depende de configurar o monitor e
deixar um ciclo faltar.

**Falta configurar em produção:** criar o check no serviço escolhido com janela compatível com a cadência
de 20 min (sugestão: período 20 min, graça 10 min) e pôr a URL em `HEALTHCHECK_URL` na Railway.

#### 11.2 — Atividade e exclusão na tabela de membros: entregue (2026-07-29)

Entregue fora de ordem, antes da 11.1, porque o dono do projeto foi procurar a informação no painel e
ela não estava lá.

**O problema de definição é a feature.** "Inativo" significava coisas diferentes com ações diferentes, e
o painel só contava `active: false`. Pior: a coluna **Stats** *parecia* responder e não respondia. Ela é
saúde da coleta, e o `readAt` dela é "quando uma leitura deu certo", não "quando a pessoa jogou". Um
membro lido com sucesso todo ciclo e sem jogar há três semanas aparecia **verde**.

**Cinco estados, e não os três baldes planejados**, numa coluna "Atividade" ao lado de Stats:

| Estado                | Quando                                              | Quem age              |
| --------------------- | --------------------------------------------------- | --------------------- |
| (sem badge, só a data)| jogou nos últimos 7 dias                            | ninguém               |
| `7+ dias sem jogar`   | uma semana quieto                                   | a pessoa              |
| `14+ dias sem jogar`  | duas semanas                                        | a pessoa              |
| `Nunca vimos jogar`   | lido sem erro, nenhuma partida registrada           | ninguém ainda         |
| `Não sabemos`         | inativo, pausado, sem identidade, ou nunca lido     | **o cadastro**        |

Por que cinco e não três: `never_seen` e `unknown` pedem ações diferentes, e juntá-los recriaria
exatamente a confusão que a fase existe para evitar. E o balde "sem login" ficou de fora porque a coluna
**Conta** já responde isso — ele era balde de uma visão geral que não tem essa coluna.

**Decisão que carrega tudo: nunca misturar "não sabemos" com "não jogou".** Um membro cuja identidade não
resolve aparece como ausente e não é: a gente simplesmente não olhou. É a mesma regra da §12 do estudo da
API, onde nulo significa "não observamos", jamais "nunca jogou". O hover card do `Não sabemos` diz
explicitamente que o problema é nosso.

**Por que a idade do snapshot mede jogo, e não coleta:** snapshot só é escrito quando `matches` e
`secondsPlayed` do `gm_all` andam. Um membro lido com sucesso e sem snapshot novo não jogou.

**Limiares:** 7 e 14 dias, em constantes. **E elas moram em `lib/member-activity.ts`, não em
`lib/queries.ts`**, o que é a armadilha desta entrega: `queries.ts` importa o Prisma, então qualquer
constante que um Client Component leia como **valor** de lá arrasta o banco para o bundle do navegador.
Declarei nele primeiro e o sintoma foi `Missing required environment variable: DATABASE_URL` num teste de
componente, que não se parece nada com problema de bundling. O módulo de rótulos só importa **tipo** de
volta, que o compilador apaga.

**Estado saudável não ganha badge** (decisão de 29/07, depois de ver na tela): quase todo o roster está
jogando, então um verde em quase toda linha é padrão que o olho para de ler, e os âmbar e vermelho perdem
o contraste que os torna úteis. Também disputava atenção com o verde "Sincronizando" da coluna vizinha,
que é outra pergunta com a mesma cor.

Sem schema novo. `getAdminMembers` ganhou o snapshot mais recente por membro (um `take: 1`) e as
contagens de histórico.

##### Exclusão de membro

Pedida junto (29/07) e **apagar de verdade**, não desativar, com a decisão tomada sabendo o custo. As
cascatas de `prisma/schema.prisma` levam junto: todo o `stat_snapshot` (que é a matéria-prima do
ranking), `member_medal`, `clan_event`, `member_top_item`, `identity_claim` e `member_invite`.
`profile.memberId` e `highlight.memberId` são `SetNull`, então o login do Discord sobrevive desvinculado.
Não existe backup.

A segurança não está em recusar, está em três coisas:

- **A confirmação é verificada no SERVIDOR**, comparando o nick digitado com o que o **banco** diz, nunca
  com um valor que veio no form. Confirmação que vive no cliente é confirmação que um POST forjado pula,
  e esta é a única ação do painel sem desfazer.
- **As contagens são específicas.** "Isso apaga o membro" é aviso que ninguém lê; "apaga 412 leituras de
  stats e 3 medalhas" é número que para a mão.
- **O botão destrutivo fica desabilitado** até o nick casar exatamente, caixa inclusive.

O diálogo também nomeia a alternativa reversível (`active: false` pelo Editar), porque na maioria dos
casos é isso que o admin realmente quer, e documentação que ninguém abre neste momento não ajuda.

**Coluna de ações:** Editar e Excluir viraram ícones de 32px lado a lado, em caixas idênticas, para os
controles caírem no mesmo x em toda linha. O texto "Editar" saiu porque era o que fazia essa coluna ser a
mais larga da tabela; `title` e `aria-label` carregam o significado que a palavra carregava.

**Verificado:** `lint`, `type-check`, `build` e 590 testes, 25 deles novos: os limiares exatos nas duas
bordas (6 dias é jogando, 7 é risco), `never_seen` em vez de `absent` sem snapshot, os cinco casos que
viram `unknown`, o caso do membro inativo **com** snapshot antigo (parece respondível e não é), e o
diálogo de exclusão inteiro.

**Não verificado:** a exclusão contra o banco real, por motivo óbvio.

#### 11.3 — Candidatura no site e fila no painel: entregue (2026-07-29)

**Decisão de 29/07: o formulário é nosso, não do Google.** Página pública na aplicação, sem header e
sem footer. Cai o Apps Script, cai o webhook, cai o segredo de transporte.

**O ganho real não é digitação, é o nome da EA.** A dívida mais cara do projeto (23 de 99 membros com
id que não corresponde a conta nenhuma, dez deles vestindo brevemente a carreira de um estranho) nasceu
de admin digitando o que achava que era o nome. Quem sabe o nome é a própria pessoa, e o formulário é
onde perguntar.

##### O formulário do Google, auditado

Buscado e lido em 29/07. São **7 perguntas**, e as 7 foram implementadas **com a redação idêntica**,
para as respostas seguirem comparáveis com a planilha que já tem anos delas:

| Pergunta                        | Tipo                                                     |
| ------------------------------- | -------------------------------------------------------- |
| Você tem o jogo comprado?       | Sim / Não, só vou jogar BattleRoyale neste momento        |
| Qual seu nome?                  | texto                                                    |
| Qual seu Whatsapp? (Com DDD)    | texto                                                    |
| Qual seu nick no jogo?          | texto                                                    |
| Qual a sua plataforma?          | Playstation 5 / Xbox / PC                                 |
| Quantos anos você tem?          | 12 a 17 / 17 a 25 / 25 a 30 / 30 a 40 / 40+               |
| Como ficou sabendo do F4F?      | Redes Sociais / Amigos / Pesquisa Google / Youtube / Outro |

**O achado que justifica a fase: o formulário não pergunta NADA que resolva a conta da EA.** "Nick no
jogo" é ambíguo — no PlayStation é o PSN ID, no Xbox o gamertag, e nenhum dos dois é o nome que a busca
da EA indexa. Copiar 1:1 reproduziria o defeito. Duas perguntas foram acrescentadas:

- **Nome de exibição da EA** (obrigatório), a única string que `/bf6/player/?name=` aceita;
- **Usuário do Discord** (opcional), porque é por lá que o acesso ao site é liberado.

As duas ficam num bloco destacado, com a explicação do porquê, já que são as que o candidato não
entenderia sozinho.

##### Schema: diferente do planejado

O plano previa um `answers Json?` para as perguntas "moles". Ficaram **colunas próprias**, porque as 7
são todas lidas pelo admin na fila e nenhuma é opcional na decisão: `realName`, `whatsapp`, `nickname`,
`platform`, `ageBracket`, `hasGame`, `referral`, mais os dois campos novos. Jsonb serviria para dado que
ninguém filtra nem exibe, e não é o caso de nenhum deles.

`AgeBracket` virou enum com as faixas **verbatim do formulário, sobreposição incluída** (`12 a 17` e
`17 a 25` contêm ambos o 17). Arrumar tornaria as respostas incomparáveis com a planilha, que é o único
histórico que o clã tem sobre quem se candidata. Vale corrigir no formulário primeiro, depois aqui.

`Recruit` **não é relação de `member`**: a candidatura aprovada guarda o `memberId` como referência
solta, sem chave estrangeira, porque os ciclos de vida são opostos. Apagar um membro não pode apagar o
registro de que ele se candidatou, que é a única coisa que explica de onde uma linha do roster veio.

**Custo da alteração de banco: barato.** Tabela nova e dois enums, aditivo, sem migrar dado, sem
backfill, sem risco para coluna existente. `db:push` aplicou e o `db:enable-rls` cobriu sozinho.

##### Decisões

- **Nunca cria membro direto.** Endpoint público que cria membro é qualquer pessoa poluindo o roster e
  o ranking. Fila de aprovação, e criar continua sendo ação de admin.
- **Página própria no painel**, não a tabela de membros: as colunas de lá são diagnóstico de coleta e as
  de uma fila são outras. Mesmo motivo pelo qual `identity_claim` é tabela separada.
- **Cards, e não tabela, na fila.** Nenhum daqueles campos é comparável entre linhas: o admin lê uma
  candidatura e decide. Uma tabela colocaria oito colunas de strings soltas truncando justo as duas que
  carregam a decisão.
- **Validar o nome da EA na APROVAÇÃO, não no envio.** Validar no envio expõe a fonte comunitária a um
  endpoint público. Segue como melhoria conhecida: validar no envio dá ao candidato a chance de se
  corrigir na hora, que é o que mata o problema na origem.
- **Aviso de duplicata ACIMA dos botões.** Resolvido na query, não no componente: é o que transforma a
  fila de lista em decisão, porque a mesma pessoa se candidatando duas vezes — ou depois de um admin já
  tê-la cadastrado — é o caso comum, e aprovar de novo cria dois cadastros que o coletor vincula à mesma
  conta. Lido depois dos botões seria tarde.
- **Filtro de três abas, padrão em aberto.** É a única que é trabalho; as outras duas são histórico, e
  abrir a página numa lista de decisões já tomadas enterra as que esperam. Os contadores vêm da lista
  inteira, então trocar de aba nunca esconde o número.
- **Recusar marca, nunca apaga.** "A gente disse não em março" é resposta que o clã vai querer quando a
  pessoa voltar em junho. Uma recusada pode ser **retomada** (só de `rejected`: retomar uma aprovada
  convidaria a um segundo membro para a mesma pessoa) ou **excluída de vez**, que é para a linha que não
  devia existir — spam, duplicata, teste. Sem confirmação digitada, ao contrário de excluir membro: o
  que se perde é uma candidatura, não uma temporada, e confirmação mais pesada que o dano é confirmação
  que as pessoas aprendem a clicar no automático.
- **Aprovar é um fluxo, não um insert:** cria o membro com o nome que o CANDIDATO informou, resolve a
  identidade e aponta a candidatura para a linha que produziu.

##### A escrita pública, e por que quatro barreiras baratas bastam

É a **única escrita sem autenticação do projeto**. O que a torna aceitável é a arquitetura, não as
defesas: um `recruit` é **inerte** — não aparece em vitrine, não pontua, coletor nenhum lê, não dá
login. O pior que um flood consegue é uma fila para limpar, nunca roster poluído nem board corrompido.

Sobre isso, quatro barreiras que não fingem ser CAPTCHA: **honeypot** (campo que humano não vê),
**tempo mínimo** de 4 s, **teto de 5 por hora por hash de IP** (hasheado, nunca guardado — o rate limit
precisa saber que é o mesmo remetente, e nada precisa saber quem) e **todo campo limitado no Zod**.
Honeypot e timer respondem com a **mesma** mensagem genérica de qualquer erro, porque dizer qual
armadilha foi acionada é ensinar a passar. CAPTCHA de verdade é dependência de terceiro e banner de
consentimento para um problema que ninguém tem ainda.

##### Duas armadilhas que valem a leitura

**O form perdia respostas ao ser recusado, e controlar os campos NÃO bastou.** Os textos voltavam e os
radios perdiam a seleção: o React reseta o form quando a função passada em `action` resolve, e só
reaplica prop que **mudou** — o estado por trás do radio não tinha mudado, então o reset ganhou. Recusar
um campo apagava silenciosamente plataforma e idade, que é pior que apagar tudo porque ninguém nota.
Corrigido com `onSubmit` e `preventDefault`; a validação nativa do navegador continua rodando antes, e
aquele caminho nunca reseta.

**O texto de ajuda do nome da EA estava errado.** Mandava não incluir a tag do clã ("se no jogo você é
F4F_Fulano, escreva só Fulano"), o que falha justamente quando a tag **é** parte do nome de exibição.
Agora manda copiar exatamente, com tag, número, símbolo e acento, porque a busca compara o nome inteiro.
Há teste afirmando que o texto antigo não volta.

##### Dado pessoal

O formulário coleta **nome real e WhatsApp**, com faixas a partir de 12 anos. Já era assim no Google,
então não é uma piora — mas passa a ser dado pessoal no nosso banco. Mitigações no lugar: RLS na tabela,
nenhum caminho de leitura público, e esses campos só aparecem na fila do painel.

##### Onde ficou

`src/features/recruit/` (`lib/schemas.ts`, `lib/actions.ts`, `lib/whatsapp.ts`,
`components/recruit-form.tsx`), a rota `src/app/candidatar/page.tsx`, e no painel
`lib/recruit-queries.ts`, `lib/recruit-actions.ts`, `components/recruits-list.tsx` e a rota
`src/app/admin/candidaturas/page.tsx`. O CTA do site aponta para `JOIN_PATH`; o link do Google virou
`LEGACY_FORM_URL`, sem uso, porque a planilha dele é o histórico.

**Verificado:** `lint`, `type-check`, `build` e 645 testes. **Não verificado:** um envio real pela
página pública, com o `x-forwarded-for` de verdade e o rate limit exercitado.

**Divulgação:** se o link do Google estiver publicado fora do site (Instagram, YouTube, grupo do
WhatsApp), precisa ser trocado por `/candidatar` lá também.

### Fase 12 — Discord como canal de saída

Última de propósito (ver a abertura das fases 9 a 12). Uma fase e não três features porque as três
compartilham o módulo novo `src/lib/discord/`, as envs e o gancho de fim de ciclo no worker. O cliente
de webhook é construído uma vez e serve as três.

Envs, todas no serviço da Railway, com tratamento tolerante em `src/lib/env.ts` (`discordConfigured`,
igual ao `storageConfigured`) para o build de CI não quebrar sem segredo.

#### 12.1 — Anúncio de promoção

Era o item 1 do Backlog de produto, e o de maior retorno da lista. **O produtor já existe:**
`recordCollectionEvents` grava `clan_event` com `kind: "promotion"` e `rankSlug` desde a Fase 8.

**Schema:** uma coluna.

```prisma
announcedAt DateTime? @map("announced_at") @db.Timestamptz(6)
```

A query é "promoção sem `announcedAt`". Marcar **depois** do POST bem-sucedido.

**Decisões:**

- **Webhook, não bot.** Promoção é saída de mão única. Webhook não precisa de processo ligado, de token
  com permissão nem de app novo para revisar.
- **A marca é coluna, não estado em memória.** O worker roda e sai; qualquer coisa em memória some e o
  ciclo seguinte reanuncia.
- **Marcar só no sucesso**, nunca em lote otimista. Um 500 do Discord que marcasse como anunciado
  perderia a promoção para sempre, e promoção é o evento mais raro do sistema.
- **Agrupar em uma mensagem** quando o ciclo promove vários. Cinco mensagens seguidas viram ruído.
- **Falha nunca custa o ciclo.** Mesma tolerância da purga de cache.
- **O link vai para `/membros/[id]`**, que é o que fecha o laço. Combina com o card Open Graph do
  Backlog de produto, que passa a valer o dobro.

**Armadilha de ordem:** o anúncio roda **depois** da purga de cache. Se o membro clicar antes, cai numa
página cacheada sem a patente nova, e o anúncio desmente o site. É a mesma armadilha de ordem do item 8
do Backlog técnico, na direção oposta.

Env: `DISCORD_WEBHOOK_PROMOTIONS`.

#### 12.2 — Digest semanal

Top 5 do mês, promoções da semana, medalhas concedidas, horas jogadas pelo clã, e quem mais subiu
posições. Tudo derivação do que já existe, sem coleta nova.

**Decisões:**

- **Cron separado na Railway, não dentro do ciclo de 20 min.** O ciclo roda 504 vezes por semana; uma
  condição "é segunda 9h?" dentro dele é frágil e testa mal. Um segundo cron job é uma linha de
  configuração.
- **Reusa `getRanking` e `getActivityFeed`.** O digest tem que dizer o mesmo que o site; query própria
  é a receita para os dois discordarem.
- **Idempotente por semana**, com a mesma marca do 12.1 ou uma tabela `digest_run` mínima. Restart da
  Railway não pode duplicar.
- **Sem `@everyone` por padrão.** Marcação semanal em canal de clã cansa rápido. Fica como env.

**Aberto, decisão do dono do clã:** dia e horário. A sugestão é segunda de manhã, porque fecha o fim de
semana, que é quando o clã joga.

Env: `DISCORD_WEBHOOK_DIGEST`.

#### 12.3 — Evento com thread e medalha

O admin cria um torneio no painel, o Discord abre a thread, os membros se inscrevem **no site**, o
admin fecha e premia os presentes de uma vez com uma medalha `special`.

**O que já existe:** o tier `special` do enum `MedalTier` foi reservado exatamente para isso, e
`member_medal.note` serve de "Torneio interno 08/2026".

**Schema:** `tournament` (`name`, `description`, `startsAt`, `endsAt`, `discordThreadId`, `medalId?`,
`status`, `createdBy`) e `tournament_signup` (`tournamentId`, `memberId`, `signedUpAt`, `attended`).
`attended` é o que vira medalha, não a inscrição: quem se inscreveu e não apareceu não ganha nada.

**Aberto, e bloqueia o início desta sub-fase:** criar thread **não** é possível com webhook comum. Dois
caminhos:

1. **Canal de fórum.** Executar o webhook com `thread_name` cria um post novo no fórum. Não exige bot,
   token nem permissão nova. É o caminho recomendado, e precisa de uma verificação no servidor do clã
   antes de virar plano firme.
2. **Bot com token** (`DISCORD_BOT_TOKEN` + `DISCORD_GUILD_ID`) chamando a REST API. Funciona em canal
   de texto normal, e custa um app Discord novo, permissões para revisar e um segredo a mais.

**Decisão: inscrição no site, não no Discord.** Inscrição por reação ou botão exige bot ou endpoint de
Interactions com verificação de assinatura. Com inscrição no site, esta fase continua sendo saída de
mão única, igual às outras duas, e o bot fica para quando o clã pedir.

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
  `/api/stats/collect` continua existindo como **gatilho manual via `curl`** — não há botão
  "coletar agora" no painel (confirmado por busca em 28/07; se um dia existir, ele chama essa rota).
- CI do starter já roda lint → type-check → test → build + E2E; manter e rodar antes de commitar.

### Segurança: RLS obrigatório em toda tabela (2026-07-29)

**O buraco, medido em produção antes da correção.** O Supabase expõe o schema `public` inteiro via
PostgREST, autorizado pela `NEXT_PUBLIC_SUPABASE_ANON_KEY` — que vai no bundle do navegador e é
**pública por projeto**. O que torna isso seguro é o RLS, e o Prisma cria tabela sem RLS. Com a chave
anônima era possível:

- ler `platform_id`, `ea_persona_id` e `discord_id` de todo membro (exatamente o que o `.gitignore`
  protege ao manter o export do roster fora de `public/`);
- ler `token_hash` e `grants_admin` de `member_invite`;
- ler `profile`, inclusive quem é admin;
- **escrever e apagar** em qualquer tabela. Um `PATCH /rest/v1/profile` com `is_admin: true`
  entregaria o painel a qualquer visitante, porque `requireAdmin` lê exatamente essa coluna.

**A correção: `pnpm db:enable-rls`.** Habilita RLS em toda tabela do `public` e **não cria policy
nenhuma** — isso é o ponto. Nada no app alcança tabela com a chave anônima: ela serve só
`supabase.auth.*` (`src/lib/supabase/server.ts`), e toda query passa pelo Prisma, que conecta como
**dono** das tabelas e portanto ignora RLS. Ligar fecha o PostgREST sem tocar no app.

Verificado depois de aplicar: leitura anônima devolve `[]` em todas as tabelas, `PATCH` numa linha que
existe devolve zero linhas, o Prisma continua lendo, e os números batem (99 membros, 1 profile admin,
nenhum sinal de alteração).

**Está encadeado no `db:push`**, e isso não é conveniência: um model novo chegaria com RLS desligado e
reabriria o buraco em silêncio, que foi exatamente como aconteceu na primeira vez. Existe também
`pnpm db:enable-rls --check`, que só reporta e sai com código diferente de zero — serve para CI se um
dia quiser travar isso lá.

**Policy só será necessária** se o navegador tiver de ler tabela direto. O primeiro caso provável é o
Supabase Realtime (item 8 do Backlog técnico), que respeita RLS: sem policy, ele não entrega evento
nenhum.

### Convite de admin (bootstrap)

O primeiro acesso ao painel vem do convite que o `pnpm db:seed` imprime no terminal. O token é
guardado **hasheado**, então um link perdido não é recuperável — só substituível, e o painel não
resolve (conceder admin exige já ser admin). Para reemitir sem apagar o banco:

```bash
pnpm invite:admin
```

Sem argumento ele pega o membro com cargo `admin`; passe o nick para escolher outro
(`pnpm invite:admin Vortex`). O link novo invalida o anterior não usado, como no painel.

### Agendamento da coleta (a cada 20 min)

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
| Cron schedule         | `*/20 * * * *` (era `*/10`, mudado em 28/07 — ver Cadência)       |
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

#### Cadência: 10 → 20 min, aplicada em 2026-07-28

Mudança de uma linha no schedule do serviço da Railway (`*/10` → `*/20`). Nada no código depende da
cadência; o orçamento de 8 min do worker limita a **execução**, não o intervalo, e continua em 8
porque a varredura leva ~4 min e subir o teto só compraria travamento mais longo.

Por que sair dos 10 min: uma execução varre o roster inteiro (75 membros em 164,9 s, `deferred: 0`),
então ciclos de 10 min sobrepunham trabalho sem comprar frescor — o cache de borda do gametools é de
~10 min de qualquer forma (`docs/api-gametools.md` §10.2) e stats só mudam quando alguém joga.

**Por que 20 e não 30.** A ideia de 30 min foi levantada e descartada em 27/07, quando a repescagem
de uma requisição falhada dependia do tick seguinte: um membro que dava 504 esperaria meia hora pela
segunda chance. As **rodadas de retentativa dentro da mesma execução** (`[3, 3, 1]`, ~0,3% de lotes
sem leitura por ciclo) tiraram a força desse argumento, mas 20 min já cobre a necessidade e não há
ganho medido em esticar mais.

#### Cap de buscas de identidade por perfil (2026-07-28)

O `MAX_IDENTITY_RESOLUTIONS_PER_RUN = 10` era único e foi calibrado contra os 45 s da função da
Vercel. Virou `ROUTE_IDENTITY_LIMIT = 10` e `WORKER_IDENTITY_LIMIT = 25`, com uma guarda de relógio
(`IDENTITY_PHASE_SHARE = 0.25`) por cima.

- **Por que subir no worker:** 10 buscas custam ~24 s (2,4 s cada, medido pelo `db:resolve-identities`:
  74 de 97 em 229 s) num orçamento de 480 s cuja varredura leva ~165 s. O cap não protegia nada, só
  fazia membro novo esperar até três ciclos para ser vinculado — **uma hora** na cadência de 20 min.
  Com 25, o backlog conhecido (23 ids inválidos) cabe num ciclo só.
- **Por que a guarda de relógio:** cap é contagem, não tempo. O `SEARCH_TIMEOUT_MS` é 10 s, então 25
  buscas contra uma EA lenta seriam 250 s dos 480 e **a varredura** é o que seria cortada. A guarda
  para de iniciar buscas depois de 25% do orçamento (120 s no worker, 11,25 s na rota) e emite aviso
  no log. Em ciclo saudável ela nunca dispara: 25 buscas a 2,4 s são 60 s.
- **Quem a guarda deixa de fora não é carimbado**, então segue na frente da fila do ciclo seguinte —
  o mesmo mecanismo que o cap já usava.
- Ainda **não** existe backoff para nome que sempre falha (está no Backlog). Com orçamento sobrando,
  pagar ~55 s por ciclo pelos 23 ids inválidos é desperdício tolerável, não concorrência com o fetch.

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

Duas linhas pedem ação humana, e só elas:

- `NUNCA foram lidos com sucesso` — `eaName` apontando para a conta EA errada. Não se cura em ciclo
  nenhum; é pedir o EA ID ao membro e corrigir no painel.
- `busca de identidade interrompida em N/M` — a guarda de relógio disparou, ou seja, a EA estava
  lenta o bastante para consumir 25% do orçamento antes do primeiro stat. Se repetir todo ciclo, a
  fonte degradou; se aparecer isolada, o próximo ciclo recomeça pelos que sobraram.

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
- `pnpm db:enable-rls` — habilita RLS em toda tabela do schema `public` (ver Segurança acima). Roda
  automaticamente no fim do `db:push`; `--check` só reporta e falha se achar tabela aberta.
- `pnpm db:rebase-ranks` — converte os saldos de carreira para a escada recalibrada. **Rodado uma
  vez, em 2026-07-28**, e a guarda dele impede uma segunda passada (ver Deploy > Agendamento).

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
- **Quem busca os stats é o `eaName`**, não o `platformId` nem o `nickname` (o input próprio de id
  saiu do formulário em 28/07; o `platformId` passou a ser derivado do nickname no salvar). Nome
  errado = membro eterno em "Stats pendentes" ou em "Conta errada?"; corrigir o `eaName` rebinda a
  identidade automaticamente, no salvar ou no ciclo seguinte da coleta.
- **Editar direto no banco não é equivalente a salvar pelo painel.** Duas coisas só acontecem na
  action: o `platformId` ser reescrito a partir do nickname e o cache da vitrine ser purgado. Uma
  linha corrigida por SQL fica com o handle antigo na tela e ainda espera o TTL de 300 s. Ver o
  item 7 do Backlog técnico, que nasceu exatamente disso.

---

## Backlog técnico (pendências pequenas, decidido em 2026-07-28)

Nada aqui bloqueia a Fase 7. São itens fechados em escopo, com o motivo já escrito, para serem
pegos um a um. Os ajustes de "modo desenvolvimento" que existiam nesta seção foram **aplicados** e
migraram para Deploy > Agendamento: a cadência de 20 min e o cap de identidade por perfil.

### 1. Headshots: exibição CORRIGIDA em 28/07, pontuação ainda aberta

**O problema é real e tem explicação inteira.** Reportado em 28/07: `Wislan Andrade` mostra
**7.179 kills e 7.720 headshots**, ou seja, mais headshots do que kills. Não é bug de coleta, é
**mistura de recortes** na mesma tela:

- `kills` = `dividedKills.human` — **sem bots**, por decisão de produto de 27/07.
- `headshots` = `gm_all.headshotKills` — **todos os modos, bots incluídos**, porque o bucket de
  classes não tem nenhum campo de headshot (`api-gametools.md` §10.3, investigado e encerrado).

Com o `gm_all.kills` desse mesmo membro em outra ordem de grandeza (a conta tem 65.533 kills totais),
7.720 headshots é coerente com a fonte e incoerente com a coluna ao lado. Qualquer membro que jogue
muito contra bots pode passar de 100% se a leitura for "headshots ÷ kills".

**Duas correções, e a segunda depende da primeira:**

1. **[FEITO em 28/07] Percentual em vez de absoluto.** O denominador é `extra.allModeKills`, que já
   estava gravado em todo snapshot — mesmo bucket do numerador, então a conta fecha e nunca passa de
   100%. `headshotRate` e `allModeKillsOf` em `snapshots.ts` (essa segunda é o único lugar que estreita
   o JSON do `extra`, então nenhum call site faz cast às cegas); a query do perfil expõe
   `headshotRate`, e o tile mostra "Headshots %" com uma decimal, porque as taxas reais se concentram
   entre 10 e 20% e arredondar para inteiro deixaria metade do clã idêntica. Sem denominador, o tile
   cai para o número absoluto e o rótulo volta a ser "Headshots" — nunca um percentual errado sob um
   rótulo que promete contagem.
2. **[ABERTO] Decidir o que fazer no ranking.** `POINT_WEIGHTS.headshots = 0.3` pontua um contador de
   todos os modos enquanto `kills` pontua só humanas, então **farmar bots infla pontos pelo termo de
   headshot**. Três saídas: tirar headshot da pontuação, reduzir o peso, ou aceitar e documentar.
   Não há quarta — a fonte não expõe headshot sem bots. Cabe na revisão do `POINT_WEIGHTS` (item 3),
   e é o que sobrou deste item.

### 2. Backoff para busca de identidade que sempre falha

Os 23 ids inválidos custam ~55 s por ciclo em buscas que nunca vão achar nada. Com o orçamento atual
sobrando, é desperdício tolerável — por isso não foi feito junto com o cap. O cuidado do desenho:
o backoff não pode ser permanente, porque **corrigir o id no painel tem de voltar a tentar na hora**.

### 3. Revisar `POINT_WEIGHTS`

Calibrado com dois membros, ambos Support. Revisar com um mês real de roster completo e classes
variadas — a série começou em 27/07, então a partir do fim de agosto. Junta com a decisão de
headshot do item 1.

**Não é uma mudança isolada.** A escada de patentes foi calibrada em 150 pontos por hora (Fase 7),
então mexer nos pesos muda os pontos por hora e **obriga** a reescalar os 16 limiares de `ranks.ts`
pelo mesmo fator. Fazer só metade muda a dificuldade de promoção sem ninguém decidir isso.

### 4. Guarda no `pnpm db:mock-history`

O `db:seed` se recusa a rodar contra banco com membro de Discord vinculado ou snapshot `source: api`
(override deliberado por `SEED_FORCE=1`). O `mock-history` **não tem guarda nenhuma** e criaria
temporadas falsas ao lado das reais, sem volta. Copiar a mesma guarda é barato e o dano evitado é
irreversível. O `db:clean-examples`, com roster real no banco, só serve ao `--reset-snapshots`.

### 5. Botão "coletar agora" no painel (opcional)

A rota `/api/stats/collect` existe com perfil de 45 s e duas passadas, e hoje só é chamada por
`curl`. Se o botão vier, ele não precisa de nada novo no backend.

### 6. Link de `/melhores-jogadas` no menu

Pendência de produto que já está no Backlog de features acima: decidir se o link sai do menu enquanto
a página for placeholder.

### 7. Colunas "só exibição" que só o painel escreve

**O caso que revelou (28/07).** O `[F4F] V1PER` foi corrigido direto no banco e a aplicação seguia
mostrando `MathexsSniper`. A coleta estava certa e nunca esteve errada: o `nucleusId` `2380261145` é
**uma conta com três personas** — `MathexsSniper` (ea), `[F4F] V1PER` (steam) e `Mathexs4627`
(xboxone) —, a mesma pessoa, e toda persona da conta devolve os mesmos stats. O que aparecia na tela
era o **`platformId`**, com o valor antigo.

O problema não é o dado velho, é o **caminho de escrita ser único e implícito**:

- `platformId` é derivado do nickname pelo `platformIdFrom()` **dentro da action**
  (`admin/lib/actions.ts`). Nenhum outro caminho escreve essa coluna, então qualquer linha tocada por
  SQL, script ou Studio guarda um handle desatualizado **para sempre**, sem sinal nenhum. Ele é
  renderizado no tooltip do `PlatformIcon` (card e perfil) e como texto na tabela do painel.
- A coluna `platform` tem a mesma natureza e já divergiu: a nossa diz `ea` e a persona vinculada é
  `steam`. Inofensivo hoje, confuso de ler amanhã, e foi o que atrasou a investigação do `dusales`
  (`api-gametools.md` §11).
- Junto disso, escrita fora da action **não purga o cache**, então mesmo o dado certo espera o TTL de
  300 s. Isso é o TTL fazendo o trabalho dele, não um bug — mas explica metade dos "editei e não
  mudou".

Três saídas possíveis, da mais barata à mais definitiva:

1. **Derivar na leitura em vez de na escrita.** Se `platformId` é sempre o nickname, ele não precisa
   ser coluna — some a chance de divergir. Custo: decidir o que fazer com as linhas cujo id foi
   digitado antes de 28/07 e não é igual ao nick.
2. **Mostrar a persona vinculada em vez do nosso `platformId`.** O `eaUsername` já é gravado na
   resolução e é o que descreve a conta que a coleta está lendo de fato. Alinha tela e coleta.
3. **Manter as colunas e documentar que edição fora do painel é incompleta**, que é o mínimo e já
   está feito em Observações.

Nada disso é urgente: não afeta número nenhum, só a legenda. Vale resolver junto do item 1, porque os
dois são a mesma classe de defeito — **a tela mostrando um recorte diferente do que a coleta usa**.

### 8. Push de verdade: Supabase Realtime no lugar do polling

Decidido em 2026-07-29 **ficar de fora por ora**, com o motivo escrito para não ser rediscutido do
zero. O que existe hoje: o feed do painel consulta a cada 30 s, e `RefreshOnFocus` (Fase 8.4) atualiza
as páginas quando o visitante volta para a aba. Falta atualização **enquanto a pessoa está olhando**.

**Por que Realtime e não WebSocket nosso.** A Vercel roda funções serverless: não há processo de vida
longa para segurar conexão, então WebSocket em `/api` está fora por modelo, não por plano. SSE é pior
que o polling aqui — a função morre no teto de duração e reconecta em loop, e duas invocações não
compartilham memória, então a função em streaming teria que consultar o banco num laço para saber que a
coleta rodou (o mesmo polling, movido para o servidor e cobrado pela duração da conexão). WebSocket
próprio exigiria processo sempre ligado na Railway: funciona, mas é serviço novo para manter e proteger.
O Realtime do Supabase resolve com servidor de terceiro que já pagamos, e o navegador conecta **direto
nele**, não na Vercel. `@supabase/supabase-js` já está instalado.

**O desenho certo: empurrar o SINAL, não o dado.** O feed é lista append-only e mesclar no cliente é
trivial, mas o ranking é lista ordenada, paginada e pesquisável onde `rank`, `points` e `previousRank`
de toda linha podem mudar — empurrar dados significaria replicar a lógica de ranking no cliente. O
padrão é: evento chega → `router.refresh()` → o Next reexecuta o render no servidor → as queries
cacheadas (já purgadas) recalculam. Uma linha de estado no cliente e zero duplicação, igual para
`/ranking`, `/membros/[id]` e qualquer página futura.

**A armadilha de ordem, que morde na primeira tentativa.** O evento do Realtime nasce do WAL no
instante do INSERT, que acontece **antes** de o worker purgar o cache. Um cliente que atualizasse
imediatamente re-renderizaria a partir do board ainda cacheado, não veria novidade e ficaria velho até
o ciclo seguinte. A correção é o worker gravar um marcador de "ciclo concluído" **depois** da purga e o
cliente assinar esse marcador em vez dos snapshots. Isso rende de graça algo que o painel vai querer:
histórico de coletas ("último ciclo: 02:40, 165 s, 3 membros atualizados").

**Pré-requisitos:** RLS já ligado (feito, ver Deploy > Segurança) mais uma policy de SELECT para
admin em `clan_event`, porque o Realtime respeita RLS e sem policy não entrega evento nenhum; e
publicar a tabela (`alter publication supabase_realtime add table clan_event`).

**Gatilho para tirar do backlog:** querer o painel realmente ao vivo e eliminar o polling de 30 s, a
cadência da coleta cair para segundos, ou aparecer mais superfície ao vivo — aí um canal serve todas.

---

## Backlog de produto (ideias levantadas em 2026-07-28)

Levantadas depois da 7.A, quando a pergunta virou "como dar vida ao site". Estão aqui em ordem de
retorno por esforço, e **quase tudo é derivação do dado que já existe** — a coleta de 20 min sobre 98
membros já produz mais do que a vitrine mostra. As três primeiras da lista original viraram a Fase 8.

### 1. Webhook de promoção no Discord — o de maior retorno da lista

> **Promovido à Fase 12.1 em 29/07.** O desenho fechado (coluna `announcedAt`, ordem em relação à purga
> de cache, agrupamento por ciclo) está lá. O texto abaixo fica como registro do levantamento.

O produtor **já existe**: a Fase 8 grava `clan_event`, então o webhook é ler os eventos novos de um
ciclo e fazer um POST. Fecha o laço que nenhuma feature interna fecha: o Discord anuncia, o membro
clica, o site recebe a visita, o membro quer subir mais.

Onde entra: no fim do ciclo do worker, junto da purga de cache, com a mesma tolerância a falha (um
webhook que não responde não pode custar a coleta). Precisa de `DISCORD_WEBHOOK_URL` como env do
serviço na Railway, e de uma marca no evento para não anunciar duas vezes — uma coluna
`announcedAt` em `clan_event` resolve, e a query fica "eventos sem `announcedAt`".

### 2. Card Open Graph por membro

`opengraph-image` dinâmico em `/membros/[id]`, com patente, avatar, K/D e pontos do mês. O Next gera
imagem nativamente (`ImageResponse`), sem dependência nova. Todo link colado no Discord passa a ser
vitrine em vez de URL crua. Cuidado conhecido: fontes precisam ser carregadas explicitamente no
runtime de imagem, e a arte das insígnias tem de ser lida como bytes, não como `<Image>`.

### 3. Sessões no perfil

O `clan_event` já registra sessão com duração e pontos. Falta a leitura: "última sessão: 2h40, 1.240
pontos" no perfil, e uma lista das últimas. É narrativa a custo quase zero, e transforma o perfil de
retrato em histórico.

### 4. Comparação entre dois membros

`/comparar?a=&b=`, derivação pura dos totais que já estão na tela. Gera conversa no Discord, que é
engajamento de graça.

### 5. Recordes do clã

"Melhor sessão do mês", "mais revives numa leitura", "maior sequência de dias jogando". O ranking
mensal premia volume; recordes premiam momentos, e momento é o que as pessoas contam. A sequência de
dias precisa de agregação sobre `stat_snapshot`, o resto sai de `clan_event`.

### 6. Sugestão automática de medalhas para o admin

O sistema de medalhas é 100% manual por design (os critérios não são detectáveis na API) e vai
continuar. O que o coletor pode fazer é **sugerir**: "Ovaca fez 400 revives este mês, considere a
medalha X". Mantém a curadoria e elimina o garimpo de números. Já previsto na 7.B.

### 7. Página de temporada encerrada

O arquivo de temporadas existe e o board fecha sozinho. Falta o ritual: campeão do mês, pódio, board
congelado como troféu.

### 8. Polimento com movimento

Números contando para cima ao entrar na viewport, transições de página com View Transitions (nativo,
sem biblioteca), hover nos cards de membro respondendo com a arte da classe, e animação de promoção
quando o membro abre o próprio perfil e subiu desde a última visita.

### O que NÃO fazer, e por quê

- **Gráfico por partida.** A fonte não expõe histórico de partidas, só totais vitalícios. Qualquer
  coisa "por partida" seria estimativa vestida de fato.
- **Melhores jogadas com upload de vídeo agora.** Continua caro (storage, validação de duração,
  thumbnail) e o Discord já resolve compartilhar clipe. Segue no Backlog de features.
