# Estudo: API gametools.network como fonte de stats do BF6

**Data:** 2026-07-25 · **Atualizado:** 2026-07-27 (kills passaram a excluir bots — seção 10.3;
investigação das alternativas e comparação com o tracker.gg — seção 10)
**Pergunta:** dá para trocar o scraping do tracker.gg (Fase 3) por consultas a uma API?
**Veredicto curto:** **sim, e com folga.** A API entrega tudo o que o site precisa, mais coisas que
não tínhamos, e simplifica a Fase 3 ao ponto de eliminar o worker com Playwright e o deploy separado.
A suposta divergência de valores com o tracker.gg foi investigada e **não existe**: são os mesmos
dados da EA, recortados de jeitos diferentes (seção 10). Resta **uma** validação que só o clã pode
fazer: conferir se os números batem com o jogo.

Tudo abaixo foi testado de verdade contra a API, com o perfil real do RRRRRRRREST, não lido da
documentação.

---

## 1. O que foi verificado

| Chamada                                      | Resultado                             | Tempo                 | Tamanho  |
| -------------------------------------------- | ------------------------------------- | --------------------- | -------- |
| `GET /bf6/player/?name=RRRRRRRREST`          | 200                                   | 0,67 s                | 235 B    |
| `GET /bf6/stats/` com persona + nucleus id   | 200                                   | 5,6 s                 | 100,8 KB |
| `GET /bf6/stats/?name=RRRRRRRREST` (sem ids) | 200                                   | 9,8 s                 | 100,9 KB |
| `GET /bf6/stats/` com `format_values=false`  | 200                                   | 1,65 s (cache quente) | 100,2 KB |
| `POST /bf6/multiple/` com 2 jogadores        | 200                                   | 2,35 s                | 172,8 KB |
| `GET /bf6/profile/`                          | 200                                   | 0,53 s                | 14,2 KB  |
| `GET /bf6/stats/?name=<inexistente>`         | 404 `{"errors":["Player not found"]}` | 0,97 s                | —        |

Identidade do nosso membro, retornada pela busca:

```json
{
  "displayName": "RRRRRRRREST",
  "personaId": "1111751848",
  "nucleusId": "1000707516734",
  "platform": "ea",
  "platformId": "cem_ea_id",
  "username": "sig4rro",
  "createdAt": "2014-08-03T13:23:26Z",
  "status": "ACTIVE"
}
```

Stats reais dele (recorte): 13.683 kills, 4.123 mortes, K/D 3,32, 388 partidas, 215 vitórias,
173 derrotas, 4.637 assistências, 3.058 revives, 1.970 headshots, 993 objetivos capturados,
score 3.708.475, 744.550 segundos jogados (8 dias, 14:49:10), precisão 28,17%.

Para comparação: o seed atual atribui 5.210 kills a ele. Confirma que os números do site hoje são
placeholder, como estava documentado.

Reproduzir:

```bash
curl -s "https://api.gametools.network/bf6/player/?name=RRRRRRRREST"
curl -s "https://api.gametools.network/bf6/stats/?playerid=1111751848&nucleus_id=1000707516734&platform=ea&format_values=false"
```

---

## 2. Três descobertas que mudam o projeto

### 2.1 Não são duas chamadas por jogador. É **uma chamada para o clã inteiro**

Existe `POST /bf6/multiple/`, descrito como "get for multiple players via grpc (max 128 players at a
time)". Testei com dois jogadores e voltou `{ "data": [ ...stats completos... ] }`, um item por
jogador, no mesmo formato do endpoint individual, em 2,35 s.

Com ~30 membros, a coleta horária inteira é **1 requisição**, não 30 ou 60. Corpo:

```json
[{ "player_id": 1111751848, "user_id": 1000707516734, "platform": "pc" }]
```

### 2.2 A busca por nome é opcional, e é melhor evitá-la

A documentação do `/bf6/stats/` diz: _"você pode enviar só o nome do jogador e a plataforma, ou
enviar (playerId) nucleus_id e platform para pular a conversão de nome"_. Medi a diferença: 9,8 s por
nome contra 5,6 s por id. Mais importante que a velocidade: **nick de jogador muda, id não**. Se
guardarmos `personaId` e `nucleusId` de cada membro uma vez, a coleta nunca quebra porque alguém
trocou o nome.

### 2.3 A fonte é a própria EA, não uma raspagem

A descrição da API diz, sobre os jogos suportados: _"All other titles are still managed by EA/Dice"_
(só BF2 e BF2142 vêm de projetos de revive). Ou seja, para BF6 o gametools é um **proxy da API
oficial da EA**, e não um scraper de página.

Isso ataca de frente o risco que travava a Fase 3. O medo documentado era o tracker.gg só atualizar
quando alguém abre o perfil, o que faria a coleta horária servir dado velho. Aqui não existe
"abrir o perfil": os dados vêm de onde a própria EA os mantém.

---

## 3. Mapeamento para o nosso `statSnapshot`

> **Revisado em 2026-07-27.** A EA mantém os stats em **buckets** diferentes e o objeto top-level da
> resposta mistura recortes (detalhes na seção 10), então cada linha abaixo diz de onde vem.
>
> **Decisão de produto vigente:** o recorte é escolhido pelo **que o stat mede**. Contadores de
> **duelo entre jogadores** (`kills`, `deaths`, `assists`, `revives`) vêm do **bucket de classes**,
> o mesmo que o tracker.gg exibe. Contadores de **objetivo e controle de mapa** vêm do grupo
> `gm_all`, cobrindo todos os modos, veículos, Portal e REDSEC. Isso exige **`seperation=true`** em
> toda chamada. Racional completo na seção 10.3.
>
> A decisão anterior (26/07) era registrar as kills completas, com bots incluídos. Está preservada
> como histórico no fim da 10.3, porque explica a semântica dos dados gravados antes de 27/07.

Encaixa inteiro, sem mudança de schema. O enum `StatSource` já tem o valor `api`.
Valores de referência do RRRRRRRREST em 2026-07-26 entre parênteses.

| Coluna nossa         | Campo de origem                                                                                                                                                | Observação                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `kills`              | **`dividedKills.human`** (12.320)                                                                                                                              | bucket de classes **com filtro de bot**. O único stat que tem esse filtro                     |
| `deaths`             | **`deaths` top-level** (4.126)                                                                                                                                 | bucket de classes. `gm_all.deaths` (4.955) misturaria recortes                                |
| `assists`            | **`classes[All].assists`** (4.365)                                                                                                                             | bucket de classes. **Inclui bots** — não existe variante humana. `gm_all.killAssists` = 6.080 |
| `revives`            | **`classes[All].revives`** (3.062)                                                                                                                             | bucket de classes. **Inclui bots**. `gm_all.revives` = 3.451                                  |
| `wins`               | `gm_all.wins` (268)                                                                                                                                            | direto                                                                                        |
| `losses`             | `gm_all.losses` (244)                                                                                                                                          | aqui a grafia é correta; o top-level escreve `loses`                                          |
| `headshots`          | `gm_all.headshotKills` (2.874)                                                                                                                                 | número absoluto. `headshots` no mesmo grupo é **percentual** (16,34)                          |
| `objectivesCaptured` | `gm_all.objectivesCaptured` (1.152)                                                                                                                            | direto                                                                                        |
| `timePlayedMinutes`  | `gm_all.secondsPlayed / 60` (745.876 s)                                                                                                                        | igual ao `secondsPlayed` top-level                                                            |
| `bestClass`          | derivar de `classes[]`                                                                                                                                         | ver abaixo                                                                                    |
| Contadores de equipe | `gm_all.objectivesDefended`, `objectivesDestroyed`, `objectivesArmed`, `objectivesDisarmed`, `sectorsDefended`, `objectiveTime`, `spots`, `health`, `repairs`  | todos sem split humano/bot na fonte                                                           |
| `extra` (jsonb)      | `allModeKills` (17.587), `allModeDeaths` (4.955), `classKills` (13.695), `allModeKillDeath`, `matches` (512), `secondsPlayed`, `winPercent`, `damagePerMinute` | os totais que **não** exibimos, para auditoria                                                |

O grupo `gm_all` também traz `killDeath`, `winPercent`, `kpm` e `dpm` prontos, coerentes entre si
(todos calculados sobre o mesmo bucket) — se formos exibir médias, usar essas em vez de recalcular
misturando recortes.

**`bestClass` exige derivação.** O campo `bestClass` no topo da resposta retorna `"All"`, que não
serve. A informação real está em `classes[]`, que traz Assault, Engineer, Support e Recon (exatamente
o nosso enum `PlayerClass`) com kills, mortes, K/D, score e tempo de cada uma. No nosso membro o
Support domina com 11.285 dos 13.683 kills. Basta ignorar a linha `"All"` e pegar o máximo por kills
(ou por tempo jogado, decisão de produto).

---

## 4. O que ganhamos de brinde

A resposta tem **70 campos no primeiro nível**, mais listas detalhadas. Coisas que hoje não temos e
que abrem features sem esforço de coleta:

- **`classes[]`** — resolve o `bestClass` e permite mostrar o desempenho por classe no perfil.
- **`maps[]`** (18 mapas) — vitórias, derrotas, partidas e tempo por mapa, com imagem no CDN deles.
- **`gameModes[]` / `gameModeGroups[]`** — Conquest, Breakthrough, Escalation, Rush, Portal, Redsec.
- **`weapons[]` / `weaponGroups[]`** — kills, precisão, headshots e tempo por arma, com arte.
- **`vehicles[]`, `gadgets[]`, `melee[]`** — mesmo nível de detalhe.
- **`seasons[]` e `redsec[]`** — desempenho por temporada e modo. Interessante para o nosso ranking:
  hoje calculamos "progresso do mês" por diferença de snapshots, e aqui existe recorte por temporada
  oficial do jogo, que pode virar uma segunda visão de ranking.
- **`XP`** — XP total, de performance e de accolades.
- **Patente do jogo** (via `/bf6/profile/`) — `rankName: "Second Lieutenant V"`, `playerCard.rank: 141`,
  imagem da insígnia no CDN, 104 badges, 39 dog tags.

O último ponto merece uma decisão de produto. Nós inventamos uma escada de 16 patentes do Exército
brasileiro em `src/lib/ranks.ts` com `rankPoints` mockados. Agora existe a alternativa de usar a
patente real do BF6. Não são excludentes: a patente do clã pode continuar sendo uma coisa nossa
(reconhecendo tempo de casa e medalhas) e a do jogo aparece como dado ao lado. Mas o `rankPoints`
mockado pode finalmente ganhar uma base real, por exemplo o XP total.

---

## 5. Problemas, armadilhas e riscos

Em ordem de importância.

### 5.1 Frescor não foi comprovado (única pendência real)

O que sabemos: a fonte é a EA, e o Cloudflare na frente da API declara `cache-control: public,
max-age=600`, ou seja, até 10 minutos de cache de borda. Para uma coleta horária, 10 minutos é
irrelevante.

O que **não** sabemos: quanto tempo a própria EA leva para refletir uma partida encerrada. Não há
nenhum campo de "última atualização" ou "última partida" na resposta para medir isso, e eu não posso
provocar uma partida. **Isso precisa de um teste com o clã** (ver Verificação, seção 8).

### 5.2 Não existe carimbo de "última partida"

Nenhum dos endpoints devolve horário da última partida. Consequência prática para a regra de "não
gravar snapshot de quem não jogou": o sinal passa a ser a **variação de `matches` e `secondsPlayed`
do grupo `gm_all`** em relação ao último snapshot (não usar o `matchesPlayed` top-level, que vem de
outro bucket — seção 10). Funciona igual, e como a coleta é uma única chamada em lote, isso deixou
de ser uma economia de requisições e passou a ser só economia de linhas no banco.

### 5.3 Nomes de campos inconsistentes e com erros de digitação

A API tem várias pegadinhas que vão morder quem escrever o parser de memória:

- **O objeto top-level mistura buckets** (a pior de todas): `kills` (13.695) vem do bucket de
  classes, `secondsPlayed` (745.876) vem do bucket geral por modo e `matchesPlayed` (388) não bate
  com nenhum dos dois (`gm_all` tem 512). K/D, KPM e médias calculadas sobre o top-level misturam
  numerador e denominador de recortes diferentes. Por isso o parser lê tudo do `gm_all` (seção 3).
- `loses` em vez de `losses`.
- `headShots` (número) versus `headshots` (percentual). Diferença de uma letra maiúscula.
- `humanPrecentage`, `gadgetsDestoyed`, `devidedDamage`, `devidedAssists`, `dividedKills`,
  `rivivals` (dentro de `seasons`). Todos assim, escritos errado, na resposta.
- `bestClass` que devolve `"All"`.

Mitigação: um único módulo de tradução, com validação Zod, isolando o resto do app desses nomes. É
exatamente o papel do `StatsProvider` que o plano já previa.

### 5.4 Percentuais vêm como texto, mas há como desligar

Por padrão a API devolve `"28.17%"`, `"55.41%"`. Passando **`format_values=false`** os mesmos campos
voltam como número (`28.17`, `55.41`). Devemos sempre usar esse parâmetro e nunca fazer parsing de
string com "%".

### 5.5 Dependência de um terceiro comunitário, sem SLA e sem limite publicado

O gametools é mantido pela Community Network, é open source e vive de doações (ko-fi e GitHub
Sponsors). Não achei nenhum limite de requisições documentado, e nos headers não há `RateLimit-*`.
Fiz 4 chamadas seguidas e não tomei 429 (a segunda em diante veio do cache do Cloudflare).

Isso é um risco de disponibilidade, não de legalidade: é uma API pública feita para ser consumida,
diferente do scraping do tracker.gg, cujo ToS proíbe acesso automatizado. Mas não há garantia de
uptime nem de estabilidade de contrato.

Mitigações que devemos adotar:

- **Uma requisição em lote por hora.** Com 30 membros isso é um consumo irrisório e educado.
- Nunca chamar a API no runtime das páginas. O banco continua sendo a fonte do site; a API só
  alimenta o banco. Se a API cair, o site continua mostrando o último snapshot.
- Backoff em erro e falha silenciosa: uma coleta perdida não é incidente.
- Manter a interface `StatsProvider` para poder trocar de fonte sem reescrever o app.

### 5.6 Payload grande

> **Número corrigido em 2026-07-29: são 721 KB por jogador, não 100 KB.** Ver §13.1. A conclusão desta
> seção não muda, só a ordem de grandeza.

100 KB por jogador, cerca de 2,5 MB para 30 membros por coleta. Não é problema para um processo
servidor, mas guardar isso inteiro no `extra` (jsonb) a cada hora inflaria o banco rápido. Vamos
extrair o que interessa e descartar o resto.

### 5.7 Plataforma tem semântica diferente da nossa

A busca diz `platform: "ea"` para o nosso membro e `"steam"` para o seu amigo; o endpoint de stats
responde `platform: "pc"`. A documentação esclarece: _"ea, xbox, psn, steam e epic são tratadas como
se fossem a mesma plataforma para stats"_. Ou seja, nosso enum `ea | xbox | psn` continua válido para
exibição, e para a API basta enviar algo compatível. Não é bloqueio, é só um detalhe de tradução.

### 5.8 Identificação precisa ser guardada

Precisamos persistir `personaId` e `nucleusId` por membro. Hoje o schema tem `platformId` (id público
exibido) e `trackerHandle` (pensado para o scraping). O `trackerHandle` perde o sentido original e o
mais limpo é substituí-lo por dois campos explícitos, populados uma vez pelo painel via busca por nome.

---

## 6. API contra scraping: comparação direta

| Critério                    | API gametools                                           | Scraping tracker.gg                                       |
| --------------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| Fonte do dado               | API oficial da EA (via proxy)                           | Página HTML de terceiro                                   |
| Frescor                     | Depende só da EA; sem "abrir perfil"                    | Risco alto de só atualizar quando alguém abre o perfil    |
| Requisições para 30 membros | **1** (lote de até 128)                                 | ~30, espaçadas com jitter                                 |
| Infra necessária            | Nenhuma nova. Cron + rota no próprio app                | Worker Docker com Chromium no Railway/Fly                 |
| Fragilidade                 | Contrato de API (muda pouco, e quebra de forma visível) | HTML e antibot Cloudflare (quebra silenciosa e frequente) |
| Manutenção                  | Baixa                                                   | Alta e recorrente                                         |
| Situação legal              | API pública feita para consumo                          | ToS normalmente proíbe automação                          |
| Bloqueio                    | Não observado                                           | Esperado                                                  |
| Riqueza de dados            | 70 campos + armas, mapas, modos, temporadas, patente    | O que estiver renderizado na página                       |
| Custo                       | Zero                                                    | Hospedagem do worker                                      |
| Risco                       | Terceiro comunitário sem SLA                            | Terceiro hostil ao acesso automatizado                    |

Não é um empate com desempate por preferência. A API ganha em todos os critérios que importam, e o
único ponto em que ela introduz risco novo (depender de um serviço comunitário) é menor do que
depender de um serviço que ativamente tenta bloquear você.

---

## 7. Consequências para o plano

**A Fase 3 encolhe drasticamente.** O que estava planejado como "worker dedicado, Dockerfile próprio,
Playwright, deploy separado no Railway, agendador interno, espaçamento com jitter, resiliência por
handle" vira:

1. Um cron (Vercel Cron ou GitHub Actions, agora que o volume é 1 requisição/hora) chamando uma Route
   Handler protegida por segredo.
2. Um provider (`GametoolsProvider`) que faz o `POST /bf6/multiple/` com os ids dos membros ativos.
3. Tradução validada com Zod e upsert de `statSnapshot` com `source: api`, gravando só quem jogou.

Some do escopo: Playwright no scraper, Chromium, Docker, pasta `scraper/`, conta e custo no Railway,
espaçamento com jitter, cadência adaptativa.

**Uma correção de rota do plano:** o documento afirma que a origem dos dados já está atrás de uma
interface `StatsProvider` em `src/lib/stats/`. Na prática essa pasta tem só `points.ts` e
`snapshots.ts` (lógica pura de ranking e derivados). O `provider.ts` e o `manual-provider.ts` nunca
foram escritos. Então a interface não é uma refatoração, é código novo, ainda que pequeno.

**A edição manual de stats continua desnecessária**, como você decidiu. Mas agora o argumento é mais
forte: a fonte automática deixou de ser frágil.

---

## 8. Verificação pendente (precisa do clã)

Um teste, dois passos, resolve a última dúvida:

1. **Fidelidade.** Peça a um membro para abrir o BF6 e comparar kills, mortes, partidas e tempo
   jogado com o que a API devolve para ele. A fidelidade contra o tracker.gg já foi confirmada
   (seção 10: os números batem recorte a recorte, é a mesma fonte da EA); o que este teste revela é
   **qual recorte a tela do jogo usa** — comparar o número do jogo com os três candidatos:
   `gm_all.kills` (17.587), `kills` top-level (13.695) e `dividedKills.human` (12.320).
2. **Frescor.** O mesmo membro joga uma partida e anota a hora do fim. Consultamos a API na sequência,
   depois a cada 15 minutos, até os números mudarem. O atraso medido define a cadência da coleta: se
   for de minutos, coleta horária é ótima; se for de horas, ainda serve, e passamos a documentar o
   atraso esperado.

Enquanto isso não for feito, a recomendação é **não divulgar o site com as seções de stats**, porque
os números do seed são placeholder (o próprio RRRRRRRREST aparece com 5.210 kills em vez de 13.683).

---

## 9. Próximos passos recomendados

1. **Fazer o teste de fidelidade e frescor da seção 8.** É rápido e é o único bloqueio real.
2. **Guardar a identidade dos membros:** trocar `trackerHandle` por `eaPersonaId` e `eaNucleusId`,
   resolvidos automaticamente a partir do `platformId` (id exato da conta) via
   `/bf6/player/?name=`. _(Feito em 2026-07-26. O `platformId` virou obrigatório no formulário
   justamente por assumir esse papel; o `nickname` ficou só como nome de exibição.)_
3. **Escrever a camada de stats de verdade:** `provider.ts` (interface + tipo `RawStats`),
   `gametools-provider.ts` (com Zod validando a resposta, `format_values=false` e
   `seperation=true`, lendo os stats do grupo `gm_all` conforme a seção 3) e testes com um
   payload real salvo como fixture, para o parser não depender da rede.
4. **Coleta:** Route Handler protegida + cron horário, gravando `statSnapshot` com `source: api`
   apenas quando `matchesPlayed` ou `secondsPlayed` mudaram.
5. **Trocar o roster de exemplo do seed pela lista real** e rodar a primeira coleta. É o que faz o
   site sair do placeholder.
6. **Depois, decidir sobre as features de brinde** (desempenho por classe, mapas, armas, patente do
   jogo, XP como base do `rankPoints`). Nenhuma delas custa coleta extra: já vêm na mesma resposta.

---

## 10. Investigação das alternativas e a "divergência" de valores (2026-07-26)

Motivação: os números do gametools pareciam divergir do tracker.gg e do "BattlefieldStats", que
concordavam entre si. Investigamos as três alternativas (api.gametools.network,
api.battlefieldstats.com, bfstats.gg) e a causa da diferença. Tudo abaixo foi verificado na fonte:
código público no GitHub, chamadas reais às APIs e à API interna do tracker.gg.

### 10.1 bfstats.gg e battlefieldstats.com são o mesmo projeto, e não são uma fonte

**bfstats.gg, battlefieldstats.com e o bot de Discord "Battlefield Stats" são um único projeto**,
do Leon "Mozzy" Larsson (repos `leonlarsson/bfstats-go`, `bfstats-api`, `bfstats-web`).

- A **api.battlefieldstats.com não serve stats de jogador**. É a API de telemetria do próprio bot:
  a raiz se intitula "Battlefield Stats Discord Bot API" e `GET /outputs/counts` devolve quantos
  stats o bot já enviou por jogo (76.074 para BF6 em 2026-07-26). Por isso "não existe endpoint de
  busca por nome" — não há stats de jogador em endpoint nenhum. As rotas do repositório
  (`events`, `outputs`, `discord-webhooks`, `users`) confirmam.
- **A fonte do bot para BF6 é a Tracker Network.** Em
  `bfstats-go/internal/datafetcher/fetchdata.go`, as requisições vão para
  `https://public-api.tracker.gg` com o header `TRN-Internal-Api-Key` — uma chave **interna**, que
  a TRN não distribui (o pedido público por uma API de BF6 no fórum deles segue sem resposta).
  Isso explica por que o bot e o tracker.gg "concordam": **são a mesma fonte**.
- O bot também tem um provider gametools (`gt`), usado para os jogos antigos.

**Conclusão:** bfstats.gg está descartado como fonte (exigiria uma chave que não podemos obter) e
a api.battlefieldstats.com nunca foi uma fonte. O gametools é a única API viável — e, como mostra
a seção seguinte, entrega exatamente os mesmos dados que o tracker.gg.

### 10.2 A "divergência" não existe: comparação número a número com o tracker.gg

Consultamos a API interna que o site do tracker.gg usa
(`api.tracker.gg/api/v2/bf6/standard/profile/origin/RRRRRRRREST`; a slug de plataforma deles para
contas EA é `origin`) e comparamos com o gametools (`seperation=true`) no mesmo dia:

| Recorte                      | tracker.gg (API interna)           | gametools                    |
| ---------------------------- | ---------------------------------- | ---------------------------- |
| Overview (bucket de classes) | 13.692 kills / 4.125 deaths        | top-level: 13.695 / 4.126*   |
| "Gamemodes" (tudo)           | **17.587 / 4.955**                 | `gm_all`: **17.587 / 4.955** |
| Multiplayer                  | 17.028 / 4.753                     | `gm_mp`: 17.028 / 4.753      |
| Conquest                     | 9.161 / 3.069                      | 9.161 / 3.069                |
| REDSEC / Battle Royale       | 238/57 e 171/51                    | 238/57 e 171/51              |
| Kills da classe Support      | 11.297                             | 11.297                       |
| Kills contra humanos         | 12.320 (exibido no perfil do site) | `dividedKills.human`: 12.320 |

\* diferença de minutos entre as coletas (o membro estava jogando).

**Idêntico, recorte por recorte.** Os dois consomem a mesma fonte da EA. O que muda é qual recorte
cada interface exibe. A EA mantém (pelo menos) três "totais" de kills diferentes, e todos aparecem
na resposta do gametools:

| Total          | Valor (RRRRRRRREST) | O que é                                                                                       | Onde está no gametools                                    |
| -------------- | ------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Geral          | 17.587              | tudo: todos os modos, veículos, Portal, REDSEC, bots incluídos                                | `gameModeGroups[id=gm_all].kills` (com `seperation=true`) |
| Por classe     | 13.695              | só kills atribuídos a uma classe (a soma de armas + veículos + gadgets + melee fecha com ele) | `kills` top-level; igual à soma de `classes[]`            |
| Contra humanos | 12.320              | exclui bots/IA; é 89,96% do bucket de classes — exatamente o `humanPrecentage`                | `dividedKills.human`                                      |

O tracker.gg exibe **`dividedKills.human`** como "Kills" no overview do perfil. O gametools põe o
bucket de classes no topo do objeto. Nenhum dos dois está "errado"; são recortes diferentes do
mesmo dado.

Dois achados laterais da comparação:

- **Frescor:** o tracker.gg atualiza o perfil sob demanda (a busca deles devolve
  "Last updated 36 minutes ago"); o gametools proxia a EA com cache de borda de ~10 min. Para a
  nossa coleta horária, o gametools tende a estar **mais** fresco, não menos. A dúvida da seção 5.1
  (atraso da própria EA) continua valendo para os dois igualmente.
- O objeto top-level do gametools **mistura buckets** (kills do bucket de classes, `secondsPlayed`
  do geral, `matchesPlayed` de nenhum dos dois) — registrado como a pegadinha número um da seção 5.3.

### 10.3 Decisão: recorte canônico do site

> **Revisado em 2026-07-27**, em duas etapas. A decisão original (26/07) era registrar tudo pelo
> `gm_all`, com bots incluídos. Primeiro as kills passaram a excluir bots; depois assists e revives
> foram para o bucket de classes, por paridade com o tracker.gg. O histórico fica ao final da seção.

**A regra é escolhida pelo que o stat mede:**

| O que o stat mede               | Recorte                          | Colunas                                                                                                                                        |
| ------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Duelo entre jogadores**       | Bucket de classes (= tracker.gg) | `kills` (com filtro de bot), `deaths`, `assists`, `revives`                                                                                    |
| **Objetivo e controle de mapa** | `gm_all`, todos os modos         | capturados, defendidos, destruídos, armados, neutralizados, setores, tempo em objetivo, spots, cura, reparos, vitórias, derrotas, tempo jogado |

**A metade dos objetivos não é escolha, é a única opção.** O `classes[]` tem exatamente nove campos
— `kills`, `deaths`, `assists`, `revives`, `killDeath`, `kpm`, `spawns`, `score`, `secondsPlayed` —
e nenhum contador de objetivo. Alinhar tudo ao bucket de classes é impossível.

### O bucket de classes NÃO exclui bots

Isso precisa estar explícito, porque a intuição erra aqui. O bucket de classes significa
"atribuído a uma classe de infantaria", **não** "contra jogadores reais".

**Só `kills` tem filtro de bot de verdade**, via `dividedKills.human`. Varrendo o payload inteiro em
2026-07-27, não existe variante humana de assists nem de revives: o `classes[*]` não tem nenhum
campo `human`, e para revives só existem class-attributed (3.062), por classe, por modo e `gm_all`
(3.451). Então **`assists` e `revives` continuam contando bots.** Foram para cá por paridade com o
tracker.gg, que o clã trata como referência, e não porque bots saíram da conta.

O `devidedAssists.human` (1.277) existe, mas suas partes irmãs são `driver`, `passenger`, `spot` e
`pilot`, o que sugere fortemente "assist como infantaria" em contraste com papéis de veículo, e não
"assist contra humano". Não é substituto e não foi usado.

### Correção: o split por modo existe, mas é incompleto

Uma versão anterior desta seção afirmava que "não existe split humano/bot por modo". **Está
errado.** Existe em `perGamemode.<modo>.dividedKills.human`, e o `humanPrecentage` varia muito por
modo: 63,48% em Breakthrough contra 100% em Team Deathmatch.

O que se sustenta é a conclusão prática: são 8 modos com dado, somando 7.688 kills humanas, contra
12.320 globais. Está **incompleto**, então não dá para reconstruir "todos os modos sem bots" a
partir dele. E a variação de 63% a 100% confirma que aplicar uma taxa global ao total geral seria
inventar número.

### Por que deaths do bucket de classes

Porque é o bucket de que o `dividedKills.human` é subconjunto, e a própria API corrobora o par:
12.320 ÷ 4.126 = **2,99**, exatamente o `infantryKillDeath` que ela publica. Pareado com o
`gm_all.deaths` (4.955) daria 2,49, razão que a API nunca reporta — a assinatura clássica de bucket
misturado (seção 5.3).

### Consequências operacionais

1. **`seperation=true` continua obrigatório** em toda chamada, somado ao `format_values=false`.
2. **Sem `dividedKills.human` ou sem a linha `classes[All]`, o membro é tratado como sem dados** e
   retentado no ciclo seguinte. Cair para o `gm_all` alargaria em silêncio o escopo de contadores
   que pontuam no ranking.
3. O `extra` guarda os totais que **não** exibimos — `allModeKills` (17.587), `allModeDeaths`
   (4.955), `allModeAssists` (6.080), `allModeRevives` (3.451), `classKills` (13.695) e
   `allModeKillDeath` — para "por que o site mostra menos que o tracker?" ser respondível pela
   própria linha do snapshot. `classKills − kills` = o tamanho do filtro de bot (1.375).
4. O sinal de "jogou desde o último snapshot" continua sendo a variação de `gm_all.matches` e
   `gm_all.secondsPlayed` (seção 5.2).
5. **Paridade com o tracker.gg** nos quatro stats de duelo, verificada contra a API em 2026-07-27:
   kills 12.320, deaths 4.126, assists 4.365, revives 3.062.

### Headshots: não existe no bucket de classes

`headshots` usa `gm_all.headshotKills` (2.874), e isso **não é concessão, é a única leitura
possível**. Verificado em 2026-07-27: nenhuma das cinco entradas de `classes[]` tem qualquer campo
com "head". Os campos de uma classe são só `kills`, `deaths`, `assists`, `revives`, `killDeath`,
`kpm`, `spawns`, `score` e `secondsPlayed`.

O `headShots` = 1.973 do top-level **não é** o bucket de classes — uma versão anterior desta seção
levantou essa suspeita e ela está descartada. Pelos `weaponGroups[]` ele parece ser um recorte por
arma, mas isso não foi confirmado e não importa: como o bucket de classes não tem headshots, não há
alternativa a escolher.

#### O efeito colateral: headshots pode passar as kills (2026-07-28)

Como `kills` exclui bots e `headshots` não, os dois números **não são comparáveis**, e em quem joga
muito contra bots a diferença fica visível na cara: `Wislan Andrade` foi lido com **7.179 kills e
7.720 headshots**. Coerente com a fonte, incoerente com a coluna ao lado.

Não é corrigível na coleta — a fonte não tem headshot sem bot. É corrigível na **exibição**, e o
denominador certo é o do mesmo bucket: `extra.allModeKills`, já gravado em todo snapshot. Uma taxa
`headshotKills ÷ gm_all.kills` nunca passa de 100% e é a mesma conta que a API pré-calcula em
`gm_all.headshots` (16,34 no fixture).

Consequência para o ranking, que é a parte menos óbvia: `POINT_WEIGHTS.headshots` pontua um contador
com bots enquanto `kills` pontua sem, então **bot farming infla pontos pelo termo de headshot**.
Decisão pendente em `plano.md` > Backlog técnico, item 1.

<details>
<summary>Decisão anterior (2026-07-26), mantida como histórico</summary>

Registrávamos as kills completas — todos os modos, armas, veículos, Portal e REDSEC, bots
incluídos: o grupo `gm_all`. O racional era ser o retrato de tudo que o jogador fez, sem manter
lista de exclusões quando a DICE adicionar modos, e ser internamente coerente. O que mudou não foi
o racional técnico, foi a preferência de produto: contar bot como abate inflava o número e
divergia do tracker.gg sem ganho para o clã.

Todo snapshot gravado antes de 2026-07-27 tem `kills` nessa semântica antiga, e por isso a série
foi zerada na migração (`pnpm db:clean-examples --reset-snapshots`) em vez de convivermos com duas
semânticas na mesma coluna.

</details>

---

## 11. Conta certa no nome, errada na pessoa (2026-07-28)

Investigação dos 4 membros que o primeiro ciclo no Railway reportou como `no_data` e que **nunca**
tinham sido lidos com sucesso. Tudo abaixo foi verificado contra a API real.

### O que a fonte devolve para eles

Não é "stats zerados", é **payload sem estrutura**: `gameModeGroups` vazio, `classes` vazio, zero
tempo jogado, e `/bf6/profile/` sem patente e sem badge. Um jogador genuinamente novo é diferente —
ele tem a estrutura, preenchida de zeros. A ausência da estrutura significa que a EA não tem registro
de BF6 naquela conta.

### A causa

O `eaName` cadastrado casou com uma conta EA que **existe e não é da pessoa**. O `pickIdentity` só
desempata **entre vários** candidatos; quando a busca devolve **uma** conta, ele vincula em silêncio,
e não há nenhum passo que pergunte "essa conta tem BF6?".

### O caso resolvido, que prova a tese

|                                          | valor                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `eaName` cadastrado                      | `Bravo_six762` — **0 resultados** na busca da EA                          |
| nome real (topo do perfil no tracker.gg) | `F4F WISLAN` — 1 conta, `xboxone`, persona `1978424143`                   |
| stats da conta correta                   | `dividedKills.human` 7.111 · `gm_all` 65.533 kills / 836 partidas / 315 h |

**Console é servido normalmente.** Uma hipótese anterior desta investigação supunha que stats de
console não passavam por este caminho da EA. Está descartada: a conta acima é Xbox e tem dados
completos.

### O que aprendemos sobre a busca `/bf6/player/`

- É **case-insensitive** e casa o nome **inteiro**, não prefixo arbitrário: `Bravo_six` acha
  `Bravo_Six`, mas `dusale` não acha `dusales`.
- **Nomes podem conter espaço** (`F4F WISLAN`).
- **Não aceita parâmetro de plataforma.** Só `name`, `playerid`, `nucleus_id` e `limit`. Não há como
  procurar uma gamertag no namespace de Xbox ou PSN.
- Buscar por `nucleus_id` **lista todas as personas da conta**, uma por plataforma. Útil para
  diagnóstico, mas atenção: a premissa do passo 2 do `pickIdentity` ("toda persona de uma conta
  devolve stats idênticas") foi verificada só em membros de PC. Nos casos vazios ela vale na direção
  inútil — todas devolvem igualmente nada.
- Em nenhuma das dezenas de contas que apareceram havia persona **`psn`**. Só `ea`, `steam` e
  `xboxone`. Pode ser amostra, mas merece teste próprio antes de culpar o nome de um membro de
  PlayStation.

### Dois avisos de método

- **Os ids na URL do tracker.gg são internos da Tracker Network.** Não são `personaId` nem
  `nucleusId`, e não servem de ponte para o gametools.
- **A coluna `platform` do nosso banco é só exibição.** O `dusales` está gravado como `psn` e a conta
  dele tem personas `xboxone`, `ea` e `steam`, nenhuma `psn`.

### Pendente

Três dos quatro (`exposiitto`, `dusales`, `F4F Richard`) seguem sem solução: nenhum nome construível
a partir do que sabemos devolve conta com dados. O nome exibido no tracker.gg funcionou em 1 de 4,
então não é fonte confiável. O caminho é pedir o **EA ID** a cada um.

---

## 12. Quem confirma a conta é o membro (2026-07-29)

Resposta ao §11. O problema não é a busca, é que **ninguém nunca foi perguntado**: `pickIdentity`
desempata entre vários candidatos, mas quando a busca devolve **um**, ele vincula em silêncio, e não
existia passo algum que perguntasse "essa conta é sua?". Custou dez membros vestindo a carreira de
estranhos, um deles pontuando 86.914 no ranking mensal.

A correção não é heurística nenhuma — `displayName` não é único nem normalizado por caixa. É pedir
para a única pessoa que sabe a resposta, mostrando números que ela reconhece.

### O que foi sondado na fonte (persona 1111751848, 2026-07-29)

`GET /bf6/profile/` devolve, além do que o anexo já listava:

| Campo                   | Valor observado                                                   | Uso no card                      |
| ----------------------- | ----------------------------------------------------------------- | -------------------------------- |
| `rankName`              | `"Second Lieutenant V"`                                           | Patente, como o jogo escreve     |
| `playerCard.rank`       | `141`                                                             | Nível numérico                   |
| `playerCard.rankImage`  | `cdn.gametools.network/ranks/bf6/...`                             | Arte da insígnia                 |
| `playerCard.badges`     | `104`                                                             | Insígnias                        |
| `totalDogTags.intValue` | `39`                                                              | Dog tags                         |
| `stats[].tp_kit_*`      | assault 22.860 · support 332.549 · engineer 43.270 · recon 19.954 | **Classe mais jogada por TEMPO** |

Três propriedades do payload que quebram parser ingênuo, todas preservadas no fixture:

1. `stats` é uma **lista plana** de `{name, value}`, não um objeto.
2. **Nomes repetem** (339 entradas, 268 nomes distintos). Somar `score_total` triplica o valor; a
   primeira ocorrência é o valor.
3. Entradas chegam **sem a chave `value`** (`kill_death_ratio`). Ausente significa desconhecido,
   nunca zero.

### Não existe carimbo de data em lugar nenhum

Sondamos o payload **inteiro** dos dois endpoints procurando qualquer coisa parecida com data (ISO,
epoch em segundos, epoch em ms): **zero ocorrências**. O `lastPlacement` vem `null`. Isso confirma a
§5.2 e tem uma consequência de produto: **"última atividade" não pode vir da fonte**. O card mostra
o nosso próprio dado (o snapshot mais recente, que só é escrito quando os contadores andaram) e
rotula como "registrada pelo site". Para uma conta candidata que nunca coletamos, o campo
simplesmente não aparece — nulo ali significa "não observamos", jamais "nunca jogou".

### As decisões

- **Nunca auto-aceitar, nem com um único candidato.** É exatamente o bug do §11.
- **Horas e partidas saem do `gm_all`**, não do topo nem da soma dos `tp_*`, para o card não
  discordar da própria página do membro. O topo carrega `matchesPlayed: 388` contra as 512 do
  `gm_all` — um card com 388 faria um casamento correto parecer errado.
- **Classe por tempo, não por kills.** O jogador sabe que é o medic da esquadra; "mais kills" pode
  apontar uma classe que ele tocou em uma rodada boa. Empate devolve nulo.
- **Schema tolerante só neste caminho.** O do coletor é estrito de propósito (contador faltando =
  pula e retenta, porque snapshot parcial corrompe o delta do mês). Aqui nada é escrito e um card
  com metade dos campos ainda identifica alguém. O `isEmptyProfile` é o **mesmo** predicado nos dois,
  por assinatura estrutural: duas cópias da regra que detecta o §11 iam divergir.
- **Confirmar é porta de mão única para o membro.** Depois disso só admin troca. E admin que troca
  para outra conta (`nucleusId` diferente) **limpa a confirmação**: o que o membro concordou foi com
  a conta antiga.
- **Rebind não precisa de guarda nova.** Todo snapshot carrega o próprio `eaNucleusId` e o
  `deltaForMonth` só subtrai linhas da mesma conta, então a carreira do estranho não vaza para o mês
  de quem acabou de se corrigir.
- **Válvula de escape obrigatória.** Quatro membros não existem em fonte alguma. Sem o "não consegui"
  eles ficariam presos na tela para sempre, e o pedido virou o estado mais urgente do painel.

---

## 13. O que já baixamos e jogamos fora (2026-07-29)

Sondagem feita para dimensionar as Fases 9 a 12 do `plano.md`. Persona `1111751848`, com os mesmos
parâmetros do coletor (`format_values=false&seperation=true`).

### 13.1 Correção da §5.6: o payload tem 721 KB, não 100 KB

Medido: **721 KB por jogador**, tanto no `GET /bf6/stats/` quanto no `POST /bf6/multiple/`, que foi
verificado devolvendo **os mesmos arrays** do endpoint individual. A §5.6 fala em 100 KB e está
desatualizada; a conclusão dela ("extrair o que interessa e descartar o resto") continua certa.

A consequência de produto é a que importa: o worker **já baixa** tudo isso e o parser descarta. Toda
feature construída sobre esses arrays custa **zero requisição nova**. O que ela custa é linha no banco,
e é lá que a decisão fica (ver Fase 10 do plano, a aritmética de 1,07 milhão de linhas por dia).

| Array              | Tamanho | Conteúdo                                                             |
| ------------------ | ------: | -------------------------------------------------------------------- |
| `weapons`          |      53 | kills, precisão, headshots, tiros, tempo equipado, arte `.webp`      |
| `gadgets`          |      43 | kills, usos, dano, spots, reparos                                    |
| `vehicles`         |      22 | kills, dano, distância, tempo dentro                                 |
| `maps`             |      18 | vitórias, derrotas, partidas, tempo, arte `.webp`. **`[0]` é "All"** |
| `gameModes`        |      16 | contadores completos por modo, arte **`.svg`**                       |
| `gameModeGroups`   |       5 | `gm_all`, `gm_mp`, `gm_modbuilder`, `gm_granite`, `gm_granitebr`     |
| `seasons`/`redsec` |     4/4 | por temporada oficial, com `modes[]` dentro                          |
| `weaponGroups`     |       9 | soma dos itens. **`[0]` é "All"**                                    |
| `XP`               |       1 | `{ total, performance, accolades }`                                  |

### 13.2 XP está no endpoint de STATS, não no de profile

`XP: [{ total: 10.308.364, performance: 4.007.831, accolades: 552.450 }]`. Procurar `xp_total` na lista
plana de `/bf6/profile/` não devolve nada: os nomes lá são outros (`score_total` existe,
`xp_total` não).

### 13.3 Kills de arma são um TERCEIRO bucket

O achado mais perigoso da sondagem, porque é silencioso:

| Recorte                                     |  Kills |
| ------------------------------------------- | -----: |
| `dividedKills.human` (o que o perfil exibe) | 12.320 |
| `weaponGroups[All].kills`                   | 13.213 |
| bucket de classes (`kills` top-level)       | 13.695 |
| `gm_all.kills`                              | 17.587 |

A soma das armas **não fecha** com as kills exibidas no perfil, e a fonte não oferece kill de arma com
filtro de bot. Mesma natureza do problema de headshots da §10.3 e do item 1 do Backlog técnico. A saída
adotada na Fase 10 é a mesma de 28/07: rótulo declarando o recorte, com precisão e tempo de uso em
destaque, em vez de esconder o número.

### 13.4 Badges e dog tags são contadores, e não há como crescer

`/bf6/profile/` devolve `playerCard.badges: 104` e `totalDogTags.intValue: 39` como **números**. Não há
lista de quais.

Varredura dos **18 endpoints BF6** do `openapi.json` procurando catálogo de badge: `/bf6/progressiontypes/`
é sobre mutators do Portal (`AiXpFactor`, `MasteryFromAllSourcesXpFactor`), e `/bf6/experience/` responde
404 no upstream da EA. **Nenhum endpoint lista badge individual.** Uma vitrine de coleção exigiria
alimentação manual, ou seja o mesmo custo do sistema de medalhas que já existe.

### 13.5 Achado novo: `competitiveRanks[]`

O payload de profile carrega um campo que o anexo não listava e o nosso schema Zod não valida:

```json
"competitiveRanks": [
  { "type": "CompetitiveSeason4", "mode": "GraniteSquad0",
    "modeName": "Redsec Quads", "rankName": "Unranked", "rankImage": null }
]
```

Divisão ranked do Redsec, por modo. Entra de graça na Fase 9.2, junto da patente.

### 13.6 `gameModes[]` mistura agregados, e um deles ganha sempre

**Encontrado rodando um ciclo real em 29/07, não lendo o payload.** A primeira execução da Fase 10
reportou **"Official" como o modo mais jogado dos 68 membros** que leu, e parecia perfeitamente
plausível.

`gm_official` carrega **725.434 s** contra os 745.876 s do `gm_all`: é a conta inteira com nome de
modo. Filtrar o nome literal `"All"` não pega, porque a fonte enfia agregados nas listas de folha com
nomes diferentes.

Os 16 itens de `gameModes[]` da persona de referência, com os agregados marcados:

| Nome                  | id              |                    Segundos |
| --------------------- | --------------- | --------------------------: |
| **Official**          | **gm_official** |                 **725.434** |
| Conquest              | gm_cq           |                     455.153 |
| Breakthrough          | gm_bt           |                     146.018 |
| Escalation            | gm_esc          |                      52.212 |
| Rush                  | gm_rush         |                      24.459 |
| Redsec Squad          | gm_brsquad      |                      20.683 |
| Portal                | gm_modbuilder0  |                      20.442 |
| Redsec Duo            | gm_graniteDuo   |                       7.689 |
| King of the Hill      | gm_koth         |                       5.055 |
| Team deathmatch       | gm_tdm          |                       4.195 |
| Domination            | gm_dom          |                       3.650 |
| Gauntlet              | gm_gntgauntlet  |                       2.584 |
| Squad deathmatch      | gm_sdm          |                       1.707 |
| _Operations_          | _gm_op_         |        _1.632 (0 partidas)_ |
| Tactical Obliteration | gm_sqdoblit     |                         397 |
| _Obliteration_        | _gm_oblitall_   | _397 (idêntico ao de cima)_ |

`gm_oblitall` e `gm_op` também são roll-ups, e ficaram **de fora do filtro de propósito**: são pequenos
demais para ganhar uma comparação, e excluir `gm_oblitall` pelo nome excluiria junto o modo genérico
Obliteration, que é legítimo.

**Em `maps[]` só existe um agregado**, o `All` (`lvlmp`) no índice 0. E **"REDSEC" (`lvlftpgranite`) é
mapa de verdade**, o do battle royale: para um membro do roster ele era honestamente o mais jogado.

### 13.7 No `/bf6/profile/`, até o `name` de `stats[]` pode faltar

A §12 já registrava entrada **sem `value`**. Em 29/07 um ciclo real falhou em **todos** os perfis que
buscou, em `playerProfiles[0].stats[338].name: expected string, received undefined`: **338 de 339
entradas estavam boas** e o schema estrito descartou o payload inteiro, levando com ele a patente, as
insígnias e os tempos de classe.

A lição, e é a segunda vez que este endpoint a ensina: **essa resposta é um saco de linhas
frouxamente tipadas**, então todo campo dela é opcional até prova em contrário. Entrada sem nome nunca
casa com uma busca do `profileStat`, então ignorá-la é de graça.

Efeito colateral que vale saber: enquanto o schema era estrito, esse payload derrubava também o card de
`/confirmar-conta` para qualquer conta com uma linha assim — o membro via um card sem patente e sem
classe, sem nenhum erro visível.

### 13.8 `/bf6/gameevents/` é o único lugar da fonte com DATA

A §12 registrou que não existe carimbo de data em lugar nenhum dos dois endpoints de jogador. Esse
terceiro endpoint tem: devolve os eventos ativos do jogo com epoch real de início e fim (`Season4`,
o battle pass `BP04`, e as janelas semanais `S04_weekly_group`). Season 4 vai de ~21/07 a meados de
outubro de 2026.

Não serve para "última partida" (continua impossível), mas serve para alinhar qualquer janela nossa com
a do jogo. Sem uso hoje: os desafios semanais, que eram o consumidor natural, foram recusados em 29/07.

---

## Anexo: endpoints do BF6 disponíveis

A API expõe 18 rotas para BF6. As que interessam a este projeto:

| Endpoint              | Uso                                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /bf6/player/`    | Buscar `personaId` / `nucleusId` a partir do **`platformId`** do membro (id exato da conta, não o nick de exibição). Uma vez por membro |
| `POST /bf6/multiple/` | **Coleta principal.** Até 128 jogadores por chamada                                                                                     |
| `GET /bf6/stats/`     | Um jogador. Útil para depurar e para "atualizar agora" no painel                                                                        |
| `GET /bf6/profile/`   | Patente do jogo, insígnia, badges, dog tags                                                                                             |

Parâmetros que sempre devemos usar em stats: `format_values=false` (números em vez de texto com
"%") e **`seperation=true`** (obrigatório: é o que traz `gameModeGroups[]`, de onde lemos o bucket
canônico `gm_all` — seção 10.3). `categories` fica no padrão (`multiplayer`); os únicos valores
aceitos são singleplayer/multiplayer e ele não controla Portal/REDSEC — enviar `categories=all`
devolve tudo zerado.

Especificação completa: `https://api.gametools.network/openapi.json` (título "Stats API for the
Battlefield series", versão 1.3.0). Documentação navegável: `https://api.gametools.network/docs`.
