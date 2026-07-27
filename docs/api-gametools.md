# Estudo: API gametools.network como fonte de stats do BF6

**Data:** 2026-07-25 · **Atualizado:** 2026-07-26 (investigação das alternativas e decisão do
bucket canônico — seção 10)
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

| Chamada | Resultado | Tempo | Tamanho |
|---|---|---|---|
| `GET /bf6/player/?name=RRRRRRRREST` | 200 | 0,67 s | 235 B |
| `GET /bf6/stats/` com persona + nucleus id | 200 | 5,6 s | 100,8 KB |
| `GET /bf6/stats/?name=RRRRRRRREST` (sem ids) | 200 | 9,8 s | 100,9 KB |
| `GET /bf6/stats/` com `format_values=false` | 200 | 1,65 s (cache quente) | 100,2 KB |
| `POST /bf6/multiple/` com 2 jogadores | 200 | 2,35 s | 172,8 KB |
| `GET /bf6/profile/` | 200 | 0,53 s | 14,2 KB |
| `GET /bf6/stats/?name=<inexistente>` | 404 `{"errors":["Player not found"]}` | 0,97 s | — |

Identidade do nosso membro, retornada pela busca:

```json
{ "displayName": "RRRRRRRREST", "personaId": "1111751848", "nucleusId": "1000707516734",
  "platform": "ea", "platformId": "cem_ea_id", "username": "sig4rro",
  "createdAt": "2014-08-03T13:23:26Z", "status": "ACTIVE" }
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

A documentação do `/bf6/stats/` diz: *"você pode enviar só o nome do jogador e a plataforma, ou
enviar (playerId) nucleus_id e platform para pular a conversão de nome"*. Medi a diferença: 9,8 s por
nome contra 5,6 s por id. Mais importante que a velocidade: **nick de jogador muda, id não**. Se
guardarmos `personaId` e `nucleusId` de cada membro uma vez, a coleta nunca quebra porque alguém
trocou o nome.

### 2.3 A fonte é a própria EA, não uma raspagem

A descrição da API diz, sobre os jogos suportados: *"All other titles are still managed by EA/Dice"*
(só BF2 e BF2142 vêm de projetos de revive). Ou seja, para BF6 o gametools é um **proxy da API
oficial da EA**, e não um scraper de página.

Isso ataca de frente o risco que travava a Fase 3. O medo documentado era o tracker.gg só atualizar
quando alguém abre o perfil, o que faria a coleta horária servir dado velho. Aqui não existe
"abrir o perfil": os dados vêm de onde a própria EA os mantém.

---

## 3. Mapeamento para o nosso `statSnapshot`

> **Revisado em 2026-07-26.** A EA mantém os stats em **buckets** diferentes e o objeto top-level
> da resposta mistura recortes (detalhes na seção 10). **Decisão de produto:** o site registra as
> kills **completas** — todos os modos, veículos, Portal e REDSEC incluídos. Isso corresponde ao
> grupo `gm_all` de `gameModeGroups[]`, disponível quando a chamada usa **`seperation=true`** (que
> passa a ser obrigatório). O mapeamento abaixo lê desse grupo, não do top-level.

Encaixa inteiro, sem mudança de schema. O enum `StatSource` já tem o valor `api`.
Valores de referência do RRRRRRRREST em 2026-07-26 entre parênteses.

| Coluna nossa | Campo em `gameModeGroups[id="gm_all"]` | Observação |
|---|---|---|
| `kills` | `kills` (17.587) | total geral. O `kills` top-level (13.695) é outro bucket, ver seção 10 |
| `deaths` | `deaths` (4.955) | direto |
| `wins` | `wins` (268) | direto |
| `losses` | `losses` (244) | aqui a grafia é correta; o top-level escreve `loses` |
| `assists` | `killAssists` (6.080) | o `assists` top-level (4.645) é outro recorte |
| `revives` | `revives` (3.451) | direto |
| `headshots` | `headshotKills` (2.874) | número absoluto. `headshots` no mesmo grupo é **percentual** (16,34) |
| `objectivesCaptured` | `objectivesCaptured` (1.152) | direto |
| `timePlayedMinutes` | `secondsPlayed / 60` (745.876 s) | igual ao `secondsPlayed` top-level |
| `bestClass` | derivar de `classes[]` | ver abaixo |
| `extra` (jsonb) | o que quisermos | precisão, dano, veículos, mapas, modos, `matches` (512) |

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

100 KB por jogador, cerca de 2,5 MB para 30 membros por coleta. Não é problema para um processo
servidor, mas guardar isso inteiro no `extra` (jsonb) a cada hora inflaria o banco rápido. Vamos
extrair o que interessa e descartar o resto.

### 5.7 Plataforma tem semântica diferente da nossa

A busca diz `platform: "ea"` para o nosso membro e `"steam"` para o seu amigo; o endpoint de stats
responde `platform: "pc"`. A documentação esclarece: *"ea, xbox, psn, steam e epic são tratadas como
se fossem a mesma plataforma para stats"*. Ou seja, nosso enum `ea | xbox | psn` continua válido para
exibição, e para a API basta enviar algo compatível. Não é bloqueio, é só um detalhe de tradução.

### 5.8 Identificação precisa ser guardada

Precisamos persistir `personaId` e `nucleusId` por membro. Hoje o schema tem `platformId` (id público
exibido) e `trackerHandle` (pensado para o scraping). O `trackerHandle` perde o sentido original e o
mais limpo é substituí-lo por dois campos explícitos, populados uma vez pelo painel via busca por nome.

---

## 6. API contra scraping: comparação direta

| Critério | API gametools | Scraping tracker.gg |
|---|---|---|
| Fonte do dado | API oficial da EA (via proxy) | Página HTML de terceiro |
| Frescor | Depende só da EA; sem "abrir perfil" | Risco alto de só atualizar quando alguém abre o perfil |
| Requisições para 30 membros | **1** (lote de até 128) | ~30, espaçadas com jitter |
| Infra necessária | Nenhuma nova. Cron + rota no próprio app | Worker Docker com Chromium no Railway/Fly |
| Fragilidade | Contrato de API (muda pouco, e quebra de forma visível) | HTML e antibot Cloudflare (quebra silenciosa e frequente) |
| Manutenção | Baixa | Alta e recorrente |
| Situação legal | API pública feita para consumo | ToS normalmente proíbe automação |
| Bloqueio | Não observado | Esperado |
| Riqueza de dados | 70 campos + armas, mapas, modos, temporadas, patente | O que estiver renderizado na página |
| Custo | Zero | Hospedagem do worker |
| Risco | Terceiro comunitário sem SLA | Terceiro hostil ao acesso automatizado |

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
   `/bf6/player/?name=`. *(Feito em 2026-07-26. O `platformId` virou obrigatório no formulário
   justamente por assumir esse papel; o `nickname` ficou só como nome de exibição.)*
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

| Recorte | tracker.gg (API interna) | gametools |
|---|---|---|
| Overview (bucket de classes) | 13.692 kills / 4.125 deaths | top-level: 13.695 / 4.126* |
| "Gamemodes" (tudo) | **17.587 / 4.955** | `gm_all`: **17.587 / 4.955** |
| Multiplayer | 17.028 / 4.753 | `gm_mp`: 17.028 / 4.753 |
| Conquest | 9.161 / 3.069 | 9.161 / 3.069 |
| REDSEC / Battle Royale | 238/57 e 171/51 | 238/57 e 171/51 |
| Kills da classe Support | 11.297 | 11.297 |
| Kills contra humanos | 12.320 (exibido no perfil do site) | `dividedKills.human`: 12.320 |

\* diferença de minutos entre as coletas (o membro estava jogando).

**Idêntico, recorte por recorte.** Os dois consomem a mesma fonte da EA. O que muda é qual recorte
cada interface exibe. A EA mantém (pelo menos) três "totais" de kills diferentes, e todos aparecem
na resposta do gametools:

| Total | Valor (RRRRRRRREST) | O que é | Onde está no gametools |
|---|---|---|---|
| Geral | 17.587 | tudo: todos os modos, veículos, Portal, REDSEC, bots incluídos | `gameModeGroups[id=gm_all].kills` (com `seperation=true`) |
| Por classe | 13.695 | só kills atribuídos a uma classe (a soma de armas + veículos + gadgets + melee fecha com ele) | `kills` top-level; igual à soma de `classes[]` |
| Contra humanos | 12.320 | exclui bots/IA; é 89,96% do bucket de classes — exatamente o `humanPrecentage` | `dividedKills.human` |

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

### 10.3 Decisão: bucket canônico do site

**Registramos as kills completas** — independente de modo, arma ou veículo, incluindo Portal e
REDSEC: o grupo **`gm_all`** de `gameModeGroups[]`. Racional: é o retrato honesto de tudo que o
jogador fez no jogo, não depende de manter uma lista de exclusões quando a DICE adicionar modos, e
é coerente internamente (K/D, KPM, win % do grupo são calculados sobre o mesmo recorte).

Consequências operacionais:

1. **`seperation=true` é obrigatório** em toda chamada de stats (é o que faz `gameModeGroups[]`
   vir na resposta), somado ao `format_values=false` que já era regra.
2. O parser do `GametoolsProvider` lê o snapshot do `gm_all` (mapeamento na seção 3) e ignora os
   agregados top-level, exceto `dividedKills.human`, que vale guardar no `extra` por ser o número
   que o tracker.gg exibe — útil quando um membro comparar o site com o perfil dele lá.
3. O sinal de "jogou desde o último snapshot" é a variação de `gm_all.matches` e
   `gm_all.secondsPlayed` (seção 5.2).

---

## Anexo: endpoints do BF6 disponíveis

A API expõe 18 rotas para BF6. As que interessam a este projeto:

| Endpoint | Uso |
|---|---|
| `GET /bf6/player/` | Buscar `personaId` / `nucleusId` a partir do **`platformId`** do membro (id exato da conta, não o nick de exibição). Uma vez por membro |
| `POST /bf6/multiple/` | **Coleta principal.** Até 128 jogadores por chamada |
| `GET /bf6/stats/` | Um jogador. Útil para depurar e para "atualizar agora" no painel |
| `GET /bf6/profile/` | Patente do jogo, insígnia, badges, dog tags |

Parâmetros que sempre devemos usar em stats: `format_values=false` (números em vez de texto com
"%") e **`seperation=true`** (obrigatório: é o que traz `gameModeGroups[]`, de onde lemos o bucket
canônico `gm_all` — seção 10.3). `categories` fica no padrão (`multiplayer`); os únicos valores
aceitos são singleplayer/multiplayer e ele não controla Portal/REDSEC — enviar `categories=all`
devolve tudo zerado.

Especificação completa: `https://api.gametools.network/openapi.json` (título "Stats API for the
Battlefield series", versão 1.3.0). Documentação navegável: `https://api.gametools.network/docs`.
