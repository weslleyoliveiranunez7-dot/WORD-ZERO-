# PROGRESSO - WORLD ZERO (arquivo de continuidade)

> Se quem estava implementando (Claude) ficar sem tokens, outra IA pode continuar lendo ESTE arquivo + `docs/DOCUMENTO_MESTRE.txt`.
> Atualize este arquivo ao final de CADA etapa.

Última atualização: 2026-11-15
Etapa atual: **Etapa 9 (Combate e PvP) - código escrito; 27 testes novos de `shared` passam (shim Node, 117 no total) e a sala do servidor foi exercitada com um Colyseus de mentira (20 checagens); servidor REAL, `duel.ts` e cliente AINDA NÃO rodados.**
(Etapa 7 anterior:) **Etapa 7 (Coleta e loot) - código escrito; 8 testes novos de `shared` passam (shim Node); servidor e cliente AINDA NÃO rodados. Persistência de inventário NÃO feita (ver abaixo).**
(Etapa 6 anterior:) **Etapa 6 (Personagem e sobrevivência) - código escrito; lógica de `shared` testada em Node (31 testes novos, 69 no total); servidor, atacante, survivor e cliente AINDA NÃO rodados**
(Etapas 7 e 8: o usuário não informou o resultado do workflow antes de pedir a Etapa 9; seguem como "escritas".)
(Decisões do usuário em 2026-11-14: itens da morte viram loot no local, baús futuros também saqueáveis por outros jogadores; kit inicial ao reaparecer aprovado. Loot entra na Etapa 7.)
(Etapa 5: usuário pediu "Etapa 6" ao enviar o repositório; o resultado do workflow da Etapa 5 não foi informado, então ela segue como "escrita" até o passo "Teste de segurança" ser visto verde.)
(Etapa 4: usuário informou que o workflow passou, incluindo os 2 bots; teste em 2 aparelhos reais não foi feito, usuário optou por pular.)
(Etapa 3: usuário relatou 10-20 FPS no celular; correção por textura enviada, resultado não informado.)

## Regras que valem sempre (resumo do Documento Mestre)
- Executar UMA etapa por vez; só avançar após teste e aprovação do usuário.
- Servidor é autoritativo; cliente só envia intenções.
- Não afirmar que algo funciona sem rodar e registrar o teste real.
- Sem segredos no código/APK/commits. Sem apagar arquitetura funcional sem aprovação.
- GitHub Pages hospeda só o cliente web, nunca o servidor multiplayer.
- Entregar projeto INTEIRO em pastas `parte-1`, `parte-2`... com menos de 100 arquivos cada (limite do upload do GitHub). Entrega por etapa = só o zip de novos/alterados (regra abaixo).
- Ao fim de cada etapa: resumo, arquivos novos/alterados, comandos, resultado real dos testes, problemas, próximo passo, este arquivo atualizado.

## Regra de entrega por etapa (importante)
O usuário NÃO quer reenviar o projeto inteiro. Em cada etapa entregar `WORLD-ZERO-etapaN.zip` com **somente os arquivos novos ou alterados**, dentro de uma pasta raiz `WORLD-ZERO/` (mesmos caminhos do repositório). O workflow `Verificar` descompacta por cima do repositório, testa e commita.
- Arquivos em `.github/` NÃO vão no zip (o workflow ignora); o usuário edita esses à mão, e o arquivo é entregue separado (`verificar.yml`).
- Arquivos que forem APAGADOS não somem com o zip: listar para o usuário apagar à mão.
- Sempre incluir no zip o `PROGRESSO.md`, o `CHANGELOG.md` e o que mais mudou.
- Lista dos arquivos da etapa fica na seção "Arquivos desta etapa" abaixo.

## Etapas
| Etapa | Descrição | Status |
|---|---|---|
| 0 | Auditoria do repositório | Concluída (não havia repositório; nada a auditar) |
| 1 | Fundação (monorepo, Vite, Phaser, Colyseus, CI) | Concluída (workflow Verificar passou) |
| 2 | Primeiro mapa 2D (personagem, câmera, colisão, teclado, joystick) | Escrita; falta conferir visualmente no celular |
| 3 | Mapa em chunks | Escrita; falta typecheck/build do cliente e conferir no celular |
| 4 | Servidor multiplayer (2 jogadores) | Concluída no workflow (2 bots + reconexão); 2 aparelhos reais não testados |
| 5 | Autoridade e segurança | Escrita; falta o workflow rodar o atacante |
| 6 | Personagem e sobrevivência | Escrita; falta o workflow rodar `survivor` e o atacante atualizado |
| 7 | Coleta e loot (+ persistência de inventário) | Escrita; falta o workflow e testar em 2 aparelhos |
| 8 | Zumbis e animais | Escrita; falta o workflow |
| 9 | Combate e PvP | Escrita; falta o workflow rodar `duel` e testar no celular |
| 10 | Crafting | Pendente |
| 11 | Construção de base | Pendente |
| 12 | Banco e persistência | Pendente |
| 13 | Servidores e lista | Pendente |
| 14 | Temporada de 7 dias e wipe | Pendente |
| 15 | Interface e polimento mobile | Pendente |
| 16 | APK e GitHub Pages | Pendente |
| 17 | Teste de carga e lançamento | Pendente |

## O que já foi feito (Etapa 1)
Arquivos criados (todos em `parte-1/`, que é a raiz do repositório):
- Raiz: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.env.example`, `README.md`, `CHANGELOG.md`, `PROGRESSO.md`
- `docs/`: `DOCUMENTO_MESTRE.txt`, `DECISOES_TECNICAS.md`
- `.github/workflows/verificar.yml` (GitHub Actions: instala, typecheck, testes, build web, liga o servidor e consulta /health, salva o pnpm-lock.yaml)
- `packages/shared/`: constantes, nomes das mensagens, 1 teste vitest
- `apps/server/`: Colyseus + Express, sala `world` (50 máx.), `GET /health`, config por variáveis de ambiente
- `apps/web/`: Vite + Phaser 3, `BootScene` que mostra o título e consulta `/health`

## O que já foi feito (Etapa 2)
- `packages/shared/src/map.ts`: tiles (grama, muro, água, árvore), `TileMap`, `createTestMap()` (40x30 tiles de 32 px, determinístico, com lago, muro com porta e árvores).
- `packages/shared/src/movement.ts`: `inputToVelocity` (diagonal não é mais rápida), `collidesAt`, `moveWithCollision` (caixa 20x20, move um eixo por vez, desliza em paredes, passo limitado a 0,05 s). Fica no shared porque o servidor vai reusar na Etapa 5.
- `packages/shared/src/movement.test.ts`: 12 testes (diagonal, parede, borda do mundo, deslizar, porta, lago, passo grande).
- `apps/web/src/game/GameScene.ts`: desenha o mapa, personagem temporário (círculo amarelo), câmera que segue com zoom ~10 tiles no lado menor da tela, teclado WASD/setas, HUD com FPS e tile.
- `apps/web/src/ui/VirtualJoystick.ts`: joystick flutuante (toque na metade esquerda de baixo; só em dispositivos touch; `?joystick=1` força no PC).
- `apps/web/src/game/BootScene.ts`: botão "JOGAR (mapa de teste)", status do servidor é opcional.
- Workflow `verificar.yml`: agora aceita qualquer `WORLD-ZERO-*.zip` e publica o cliente no GitHub Pages (job `publicar`, exige Settings > Pages > Source = GitHub Actions).

## Arquivos desta etapa (Etapa 2) - vão no `WORLD-ZERO-etapa2.zip`
Novos:
- `packages/shared/src/map.ts`
- `packages/shared/src/movement.ts`
- `packages/shared/src/movement.test.ts`
- `apps/web/src/game/GameScene.ts`
- `apps/web/src/ui/Hud.ts`
- `apps/web/src/ui/VirtualJoystick.ts`
Alterados:
- `packages/shared/src/index.ts`
- `apps/web/src/game/BootScene.ts`
- `apps/web/src/main.ts`
- `PROGRESSO.md`, `CHANGELOG.md`, `README.md`, `docs/DECISOES_TECNICAS.md`
Fora do zip (editar à mão): `.github/workflows/verificar.yml` (nova versão com aceite de `WORLD-ZERO-*.zip` e job `publicar`).
Apagados: nenhum.

## O que já foi feito (Etapa 3)
- `packages/shared/src/chunks.ts`: `CHUNK_SIZE=16`, mundo de teste 8x8 chunks (128x128 tiles), geração determinística por seed (hash inteiro + value noise), 4 regiões (planície, floresta, lago, ruínas), spawn no centro com área livre, borda do mundo sólida. `ChunkedWorld` com cache, `getChunk`, `isSolid`, `updateLoaded` (carrega raio 1 = 3x3, descarrega além do raio 2).
- `movement.ts`: `moveWithCollision`/`collidesAt` aceitam `TileMap` ou `ChunkedWorld` (tipo `SolidMap`). Mapa de teste da Etapa 2 continua existindo e testado.
- `apps/web/src/game/GameScene.ts`: usa `ChunkedWorld`, um `Graphics` por chunk criado ao carregar e destruído ao descarregar (só reage quando o jogador troca de chunk); HUD mostra chunk atual e quantos estão carregados.
- `apps/web/src/ui/Minimap.ts`: minimapa por chunk (cor da região, chunks não carregados escurecidos, ponto do jogador).
- `packages/shared/src/chunks.test.ts`: 8 testes (determinismo, seeds, ordem de geração, borda/spawn, tileAt, carregar/descarregar, travessia de vários chunks, desempenho).

## Verificado e não verificado (Etapa 3)
- Verificado (Node 22, tsc, shim do vitest): 22 testes de `shared` passaram (8 novos + 12 de movimento + 2). Geração de 64 chunks em ~8 ms (~0,13 ms/chunk) neste ambiente. Caminhada simulada atravessou 5 chunks, no máximo 12 residentes, 18 gerados, 6 descartados, posição sempre finita e fora de sólidos.
- NÃO verificado: typecheck e build do cliente (Phaser/Vite) com `GameScene.ts` e `Minimap.ts`; desenho dos chunks, minimapa e desempenho no celular/A04; vitest real (o workflow confirma).
- Ainda não existe: mundo maior que 8x8 (ampliar só depois de medir no A04), persistência de alterações em chunks, sincronização de chunks no servidor (Etapa 4/5).

## O que já foi feito (Etapa 6)
- `shared/items.ts`: 4 itens (comida enlatada, garrafa de água, bandagem, barra de energia) com nome, categoria, peso, pilha máxima e efeito; só o servidor aplica efeitos.
- `shared/inventory.ts`: 12 slots (grade 4x3), `add` (completa pilhas), `removeFromSlot` (valida slot e quantidade), `snapshot` (cópia que vai para a rede), kit inicial (2 água, 2 comida, 1 bandagem).
- `shared/survival.ts`: `SurvivalSim` com vida, fome, sede e energia (0-100). Fome cai a ~30 min, sede ~20 min; andar gasta energia, parado recupera; fome/sede críticas (<20) reduzem a recuperação de energia; energia <20 reduz a velocidade (mínimo 60%); com fome ou sede ZERADA há 30 s de tolerância e depois 1 de dano/s por medidor zerado; vida regenera só com fome e sede >=50. Valores iniciais para testar, não são balanceamento final.
- `shared/life.ts`: `PlayerLife` = tudo de um jogador no servidor (medidores + inventário + morte). `useItem` (morto? actionId novo? cooldown 500 ms? slot existe? efeito real? só então gasta 1), `die` (perde TODO o inventário), `respawn` (só morto, só após 5 s, volta com medidores e kit iniciais). `actionId` estritamente crescente: repetir um id nunca repete a ação (idempotência, Documento Mestre 8.3).
- `shared/security.ts`: `inspectUseItem` e `inspectRespawn` (só `{slot, actionId}` / `{actionId}`; campo extra = manipulação, peso 5).
- `shared/protocol.ts`: PROTOCOL_VERSION 2; `PlayerSnap.dead`; mensagens `PLAYER_STATE`, `INVENTORY_UPDATE` (servidor -> dono), `REQUEST_USE_ITEM`, `REQUEST_RESPAWN` (cliente -> servidor).
- `shared/playersim.ts`: `speedMul` (definido só pelo servidor) e `teleport` (só reaparecimento).
- `WorldRoom`: cada jogador tem `PlayerLife`; tempo de sobrevivência avança no tick; morto não anda; PLAYER_STATE/INVENTORY_UPDATE enviados quando mudam e a cada 1 s/2 s (cobre entrada e reconexão); durante a janela de reconexão (15 s) o tempo de sobrevivência fica CONGELADO (não punir quem perdeu a rede). `SURVIVAL_SCALE` (env, 1-1000, só para teste) acelera o tempo de sobrevivência.
- Cliente: `ui/SurvivalUi.ts` (4 barras, avisos, grade de inventário que usa o item ao tocar ou tecla 1-9, tela "VOCÊ MORREU" com itens perdidos e botão REAPARECER com contagem). Só aparece no modo ONLINE. Cliente só mostra o que o servidor mandou e envia intenções.
- `server/src/survivor.ts`: cliente real que, contra um servidor com tempo x100, confere: estado inicial, queda de fome/sede, beber (1 item e sede sobe), replay de actionId, item sem efeito, morte por fome/sede, inventário zerado, morto não anda nem usa item, reaparecer cedo recusado, reaparecer vivo com kit, reaparecer de novo não duplica.
- `attacker.ts` ganhou: cliente tentando impor PLAYER_STATE/INVENTORY_UPDATE, usar item com campos extras, slot/actionId inválidos, reaparecer vivo, rajada de usos (cooldown) e replay de actionId.
- Workflow: novo passo "Teste de sobrevivência" (2º servidor na porta 2568 com `SURVIVAL_SCALE=100`).

## Verificado e não verificado (Etapa 6)
- Verificado (Node 22 + tsc + shim do vitest): typecheck de `shared`; 69 testes passaram (31 novos: medidores, tolerância, dano, inventário, cooldown, replay, morte sem duplicação, 3.000 ações hostis, validação, velocidade com `speedMul`). Typecheck de `WorldRoom`, `attacker`, `survivor`, `bot`, `NetClient` e `SurvivalUi` contra stubs simplificados de colyseus/colyseus.js (confere só o uso dos tipos do `shared`).
- NÃO verificado: `pnpm install`/typecheck real de servidor e cliente (Phaser/Colyseus não instalados aqui); servidor, atacante e survivor rodando; aparência do HUD/inventário/tela de morte no celular; o botão do inventário (46 px) no A04; se o `onMessage` de tipos específicos tem prioridade sobre o `"*"` no Colyseus 0.15 (suposição).
- Limitações conhecidas: sem persistência (sair/reconectar após 15 s zera tudo); morrer PERDE o inventário e ele NÃO vira mochila no chão (isso entra na Etapa 7 com os itens no mundo; ver DECISOES_TECNICAS); sem como GANHAR itens além do kit inicial até a Etapa 7 (coleta); só dano de fome/sede (zumbis/PvP nas Etapas 8-9); sem ciclo de dia/noite; sem correr; sem mover itens entre slots (`REQUEST_INVENTORY_MOVE` ainda é "ação não implementada"); sem limite de peso.

## Critério de aceite da Etapa 6
Estado é atualizado e validado pelo servidor. Só marcar como concluída quando: (1) o workflow `Verificar` passar, incluindo "Teste de segurança" (atacante atualizado) e "Teste de sobrevivência" (todos OK) e (2) o usuário abrir o jogo ONLINE num servidor público, ver as barras caindo, usar um item pelo inventário, morrer e reaparecer.

## Arquivos desta etapa (Etapa 6) - vão no `WORLD-ZERO-etapa6.zip`
Novos: `packages/shared/src/{items,inventory,survival,life}.ts`, `packages/shared/src/survival.test.ts`, `apps/server/src/survivor.ts`, `apps/web/src/ui/SurvivalUi.ts`
Alterados: `packages/shared/src/{index,protocol,playersim,security}.ts`, `packages/shared/src/network.test.ts`, `apps/server/src/{index,config,attacker}.ts`, `apps/server/src/rooms/WorldRoom.ts`, `apps/server/package.json`, `apps/web/src/net/NetClient.ts`, `apps/web/src/game/GameScene.ts`, `PROGRESSO.md`, `CHANGELOG.md`, `README.md`, `docs/DECISOES_TECNICAS.md`
Fora do zip (editar à mão): `.github/workflows/verificar.yml` (novo passo "Teste de sobrevivência").
Apagados: nenhum.

## O que já foi feito (Etapa 5)
- `shared/security.ts`: `PlayerGuard` (limite de 60 msg/s com rajada de 100; pontuação de violações que decai; expulsa com 100 pontos, código 4003) e `inspectInput` (só aceita exatamente `{seq, ix, iy}` dentro de -1..1; campos extras como x/y/speed/damage = manipulação).
- `shared/playersim.ts`: `PlayerSim` = estado autoritativo do jogador; ignora input velho (replay), NaN/Infinity viram "parado", passo limitado, verifica velocidade máxima, colisão e valores finitos após cada passo (se falhar, volta à posição anterior e loga BUG).
- `WorldRoom`: toda mensagem passa por limite de frequência -> validação estrita -> simulação; `onMessage("*")` recusa tipos desconhecidos e ações ainda não implementadas (`REQUEST_*`); `ACTION_REJECTED` ao cliente (máx. 1/s); logs `[seguranca]` com no máximo 1 linha/s por jogador e motivo; expulsão por comportamento suspeito. `maxPayload` 2 KB no WebSocket.
- Cliente: manda no máximo ~30 msg/s; `NetClient` não tenta reconectar quando é expulso (4003).
- `server/src/attacker.ts`: cliente malicioso real que tenta impor posição, velocidade/NaN, mensagens inventadas, `TELEPORT`, `REQUEST_ATTACK`, flood e payload gigante; cada ataque deve falhar. Passo "Teste de segurança" no workflow.

## Verificado e não verificado (Etapa 5)
- Verificado (Node + tsc): typecheck de `shared`; 11 testes novos (limite de frequência, expulsão, entradas hostis, 20.000 passos hostis sem sair do mapa, sem passar da velocidade e sem "correção").
- NÃO verificado: servidor/atacante/cliente rodando; `onMessage("*")`, `maxPayload` e código de saída 4003 do Colyseus 0.15 são suposições a confirmar no workflow.
- Ainda pendente do Documento Mestre 8.3, por não existirem as ações: validação de alcance, cooldowns, inventário, IDs de ação idempotentes e proteção contra duplicação (entram com as Etapas 6 a 10). Autenticação/contas (8.4) e logs persistentes (`audit_logs`, Etapa 12) também ficam para depois. O atacante ainda vem de um cliente "bem-comportado" no mesmo IP: sem limite por IP/conexões simultâneas.

## Critério de aceite da Etapa 5
Cliente não consegue impor posição ou ação inválida. Só marcar como concluída quando o passo "Teste de segurança" do workflow mostrar todos os ataques como OK (e os testes e o multiplayer continuarem passando).

## O que já foi feito (Etapa 4)
- `shared/protocol.ts`: tipos `PlayerInputMsg`, `PlayerSnap`, `WorldSnapshot`, `JoinOptions`, validação `parseInput`/`parseJoinOptions`, constantes (20 Hz, 100 ms de interpolação, 15 s de reconexão). Sem Colyseus Schema: mensagens JSON (`PLAYER_INPUT` cliente->servidor, `WORLD_SNAPSHOT` servidor->todos).
- `shared/interpolation.ts`: `SnapshotBuffer` (interpola, não extrapola). `network.test.ts`: 7 testes.
- `server/WorldRoom.ts`: servidor simula o movimento com `moveWithCollision` (mesma função do cliente) a 20 Hz; recusa protocolo diferente (`onAuth`); `allowReconnection` por 15 s; limite por `MAX_PLAYERS` (padrão 50, 1-200).
- `server/src/bot.ts`: cliente de teste (processo separado) que entra, vê o outro, anda e (opção `--reconnect`) derruba a conexão e reconecta.
- Cliente: `net/NetClient.ts` (conecta, reconecta sozinho), botão JOGAR ONLINE, jogadores remotos azuis interpolados, HUD mostra status e nº de jogadores. URL do servidor: `?server=wss://...` > `VITE_SERVER_URL` > localhost.
- Workflow: passo "Teste multiplayer" liga 2 bots em processos separados contra o servidor real.

## Verificado e não verificado (Etapa 4)
- Verificado (Node + tsc): typecheck de `shared` e testes de `parseInput`/`SnapshotBuffer`.
- NÃO verificado: `pnpm install` com `colyseus.js`; typecheck do servidor, bot e cliente; servidor aceitando `onAuth`/`allowReconnection`; API `client.reconnect(token)` e `room.reconnectionToken` do colyseus.js 0.15 (suposição); os 2 bots no workflow; qualquer teste em 2 aparelhos.
- Limitações conhecidas: sem reconciliação por `seq` (cliente só corrige se divergir >64 px); servidor sem anti-cheat (Etapa 5); mundo de teste único e todos os jogadores na mesma sala; sem nomes/contas.
- Para jogar online pelo celular é preciso um servidor PÚBLICO com `wss://` (GitHub Pages é https e só hospeda o cliente). Hospedagem ainda é decisão em aberto.

## Critério de aceite da Etapa 4
Dois aparelhos/navegadores veem os mesmos jogadores e movimentos. Só marcar como concluída quando: (1) o passo "Teste multiplayer" do workflow passar (2 bots em processos separados se veem, o servidor move cada um, e reconexão mantém o mesmo sessionId) e (2) o usuário abrir 2 aparelhos num servidor público e se ver andando.

## Problema encontrado no celular (Etapa 3)
- Usuário mediu 10 a 20 FPS. Causa provável: um `Graphics` por chunk é reexecutado a cada frame (~256 comandos x 9-12 chunks). Correção: cada chunk é desenhado uma vez e convertido em textura (`generateTexture`), 1 imagem por chunk; `antialias:false`/`pixelArt:true` no Phaser. NÃO verificado no celular; se continuar baixo, medir de novo (ver HUD) antes de mexer em outra coisa (próximos suspeitos: zoom/resolução da tela, minimapa, joystick).

## Critério de aceite da Etapa 3
Jogador atravessa vários chunks sem travar e sem perder posição. Só marcar como concluída quando: (1) o workflow `Verificar` passar e (2) o usuário abrir o jogo no celular, andar por vários chunks, ver o minimapa seguir o ponto e o contador de chunks carregados ficar em poucas unidades (máx. esperado 25), sem engasgos.

## Verificado e não verificado (Etapa 2)
- Verificado: os 14 testes de `shared` (incluindo os 12 de movimento) passaram rodando em Node 22 com um shim do vitest. O workflow `Verificar` ainda vai confirmar com vitest/tsc de verdade.
- NÃO verificado: typecheck e build do código do cliente (Phaser/Vite), a aparência da tela, o toque do joystick em celular real, o desempenho no A04.

## O que ainda falta para Android (Etapa 2)
- Capacitor/APK não configurado (Etapa 16); por enquanto só navegador do celular via GitHub Pages.
- Botões de ataque/interação/inventário/correr (Etapa 6 em diante) e ajuste de posição/tamanho dos controles.
- Medir FPS e consumo no A04 e decidir zoom/tamanho do joystick depois do teste real.
- Orientação da tela (retrato/paisagem) e reconexão ao voltar para o app (Etapas 4 e 16).

## Como o usuário testa (sem computador)
O usuário NÃO tem computador. O teste é feito pelo GitHub Actions (workflow `Verificar`), pelo celular: aba Actions do repositório, ver o resumo da execução. Se algo falhar, ele cola o erro do log no chat.
O próprio workflow descompacta qualquer `WORLD-ZERO-*.zip` (ex.: `WORLD-ZERO-etapa2.zip`) se ele estiver na raiz do repositório (o workflow foi criado à mão pelo usuário, pois o GITHUB_TOKEN não pode criar arquivos em `.github/workflows`).

## Histórico de testes no GitHub Actions
- Execução 1: falhou no `pnpm/action-setup` (versão do pnpm declarada duas vezes). Corrigido removendo `version: 9` do workflow.
- Execução 2: instalar, tipos, testes e build web passaram; servidor falhou com `colyseus does not provide an export named 'Room'` (módulo CommonJS importado em ESM). Corrigido removendo `"type": "module"` de `apps/server/package.json` e `packages/shared/package.json`.
- Execução 3: tudo passou (instalar, tipos, testes, build web, servidor /health). Etapa 1 concluída.

## O que NÃO foi verificado (importante)
O ambiente onde o código foi escrito não tinha acesso à internet, então:
- `pnpm install` NÃO foi executado (sem `pnpm-lock.yaml`).
- `pnpm typecheck`, `pnpm test`, `pnpm dev:server`, `pnpm dev:web` e `pnpm build:web` NÃO foram executados.
- A compatibilidade exata entre Colyseus 0.15, `@colyseus/ws-transport` e Express é suposição baseada na documentação; confirme ao rodar.
- ESLint ainda não foi configurado.

## Critério de aceite da Etapa 1 (concluída)
Cliente abre uma tela simples e o servidor inicia sem erro. Só marcar como concluída depois que o workflow `Verificar` mostrar tudo como `success` (instalar, tipos, testes, build web, servidor/health). A conferência visual da tela do cliente ("Servidor: online") ainda não é coberta pelo workflow.
Se algo falhar, corrigir antes da Etapa 2.

## Critério de aceite da Etapa 2
Personagem anda, colide e a câmera acompanha. Só marcar como concluída depois que: (1) o workflow `Verificar` passar e (2) o usuário abrir o jogo publicado no GitHub Pages, tocar em JOGAR e confirmar que anda com o joystick, colide com muro/lago/árvore, atravessa a porta e a câmera acompanha.

## Próximo passo
1. Usuário atualiza o `verificar.yml`, sobe `WORLD-ZERO-etapa2.zip`, ativa o Pages e informa o resultado.
2. Corrigir o que falhar; marcar a Etapa 2 como concluída.
3. Etapa 9 entregue em `WORLD-ZERO-etapa9.zip` + `verificar.yml` novo (passo "Teste de combate PvP"). Se o workflow falhar, o usuário cola o erro do log no chat. Depois de aprovada: Etapa 10 (crafting; o porrete passa a poder ser fabricado e a troca de arma pode entrar junto).

## Decisões em aberto
Ver `docs/DECISOES_TECNICAS.md`.

## Prompt para continuar em outra IA
"Leia `PROGRESSO.md` e `docs/DOCUMENTO_MESTRE.txt` inteiros. Inspecione o repositório antes de alterar qualquer coisa. Continue a partir da etapa indicada em PROGRESSO.md, execute somente essa etapa, teste de verdade, e atualize PROGRESSO.md e CHANGELOG.md ao final."

## Etapa 7 - Coleta e loot (escrita, 2026-11-14)
- Recursos derivados do mapa (sem objetos novos): árvore = madeira (3 un.), muro das ruínas = pedra (3) ou sucata (2). Borda do mundo não rende nada.
- `REQUEST_INTERACT {actionId}`: sem alvo e sem posição. O servidor usa a posição que ele conhece e escolhe: mochila mais próxima (alcance 56 px); senão o recurso mais próximo. 1 unidade por ação, recarga 600 ms.
- Concorrência: o servidor guarda o que já foi retirado de cada recurso e atualiza na mesma chamada síncrona; inventário cheio não consome o recurso. Recurso mexido volta ao normal após 60 s sem toque.
- Mochila de morte: ao morrer, `PlayerLife.lost` vira UMA mochila no local (`LootWorld.addDrop`); quem pega leva o que couber, o resto fica. Expira em 5 min (provisório), máx. 200 no mundo.
- Protocolo 3: `ENTITY_UPDATE {drops, depleted}` (enviado ao mudar + a cada 2 s). Cliente: botão COLETAR, marca X em recurso esgotado, quadrado marrom em mochila.
- Arquivos: `packages/shared/src/{loot.ts,loot.test.ts,items.ts,life.ts,protocol.ts,security.ts,index.ts,chunks.ts}`, `apps/server/src/rooms/WorldRoom.ts`, `apps/web/src/{net/NetClient.ts,game/GameScene.ts,ui/SurvivalUi.ts}`.
- Verificado: 8 testes novos (2 jogadores no mesmo recurso = total 3; distância; respawn; inventário cheio; mochila conserva itens; expiração; id repetido/recarga/morto; campos extras).
- NÃO verificado: servidor/cliente/bots rodando de verdade (sem `pnpm install` aqui); `survivor.ts`/`attacker.ts` não ganharam casos da Etapa 7; aparência do botão no celular.
- NÃO feito: **inventário persistente** (exige identidade do jogador: conta/token; decisão em aberto) e "loot de edifícios" além de pedra/sucata nas ruínas. Baús ficam para depois.
- Critério de aceite: workflow passar + 2 aparelhos coletando a mesma árvore sem passar de 3 madeiras no total.

## Etapa 7 - Persistência de inventário (escrita, 2026-11-14)
- Identidade: chave secreta aleatória gerada no aparelho (localStorage `wz_key`), enviada no join (`JoinOptions.key`, opcional). O servidor guarda só o SHA-256 dela.
- Salva (`packages/shared/src/persist.ts`): inventário, 4 medidores, posição. Autosave 30 s, ao sair/expulsar, ao morrer, no desligamento (`onDispose`). Morto é salvo como "recomeçar" (kit inicial, spawn).
- Armazenamento (`apps/server/src/store.ts`): Supabase se `SUPABASE_URL`+`SUPABASE_KEY`; senão arquivos em `DATA_DIR` (padrão `data/`, no `.gitignore`). No Render gratuito o disco é apagado: só o Supabase persiste de verdade. Passo a passo em `HOSPEDAR_SERVIDOR.md`.
- Segurança: dado carregado é revalidado (`parseSave`); falha ao LER recusa a entrada (não sobrescreve personagem com um vazio); mesmo personagem não entra 2x (códigos 4002/4004); sem chave = joga sem salvar.
- Verificado: 4 testes novos em `persist.test.ts` (ida e volta, morto, dados adulterados, validação da chave).
- NÃO verificado: `FileStore`/`SupabaseStore` rodando de verdade, a tabela do Supabase, reinício do servidor com personagem restaurado, `onDispose` no SIGTERM do Render, localStorage no celular.
- Fora do salvamento: mochilas de morte e recursos esgotados (voltam ao normal no reinício).

## Etapa 8 - Zumbis e animais (escrita, 2026-11-15)
- `packages/shared/src/mobs.ts` (`MobWorld`): 30 zumbis (percebem a 220 px, perseguem a 80 px/s, atacam a 26 px: 8 de dano por 1 s, perdem o interesse a 380 px e voltam para casa) e 16 cervos (fogem a 120 px/s quando alguém chega a 150 px). Posições iniciais determinísticas, em chão livre, a 12+ tiles do spawn. Renascem em 60 s (não com jogador a < 300 px).
- Proximidade: só simula criatura com jogador vivo e conectado a até 640 px; as outras ficam congeladas e não vão para a rede. Cada criatura existe uma única vez, no servidor.
- Combate mínimo: `REQUEST_ATTACK {actionId}`; o servidor escolhe a criatura viva mais próxima (48 px), punho = 10 de dano, recarga 700 ms (`PlayerLife.startAttack`). Morreu: loot vira mochila no chão (zumbi: sucata/bandagem; cervo: carne crua, novo item `raw_meat`). Dano de zumbi usa `survival.damage` (morte e mochila da Etapa 6/7).
- Protocolo 4: `WorldSnapshot.mobs`. Cliente: bolinhas vermelhas (zumbi) e marrons (cervo), botão ATACAR.
- Verificado: 9 testes novos em `mobs.test.ts` (populate, perseguição e recarga, 2 jogadores sem golpe duplicado, congelamento, perder interesse, fuga, morte única com loot, renascimento, startAttack).
- NÃO verificado: servidor e cliente rodando; custo de CPU no Render gratuito; bots do workflow (podem esbarrar em zumbis longe do spawn); aparência/toque dos botões.
- Limitações: IA sem pathfinding (zumbi trava atrás de parede); sem armas (Etapa 9); animais não atacam; sem ruído/visão; mobs não são salvos.


## Etapa 9 - Combate e PvP (escrita, 2026-11-15)
- `packages/shared/src/combat.ts`: `performAttack` (único caminho de dano de jogador: atacante vivo -> `actionId` novo -> recarga da arma -> alvo com alcance e linha de visão -> vítima viva e sem proteção -> dano), `bestWeapon` (arma de maior dano do inventário; sem arma = punho), `chooseTarget` (mais próximo, jogador ou criatura; empate = criatura), `lineClear` (parede/árvore bloqueiam, água não), `killCredit` (último a causar dano em até 15 s).
- `items.ts`: item `club` (porrete: 20 de dano, alcance 52 px, recarga 800 ms, 1 por slot) e `WeaponStats`. Zumbi larga porrete com 8% (`mobs.ts`). Punho: 10 / 48 px / 700 ms.
- `life.ts`: `startAttack(actionId, now, cooldownMs)` usa a recarga da arma; `takeHit` (dano de jogador; ignora morto, vida já zerada no tick, protegido, valor inválido); proteção de 3 s só contra jogadores logo após reaparecer (`SPAWN_GRACE_MS`), encerrada se o protegido atacar; `lastHit` para o crédito.
- `WorldRoom`: `REQUEST_ATTACK` só chama `performAttack` com as posições/inventários do servidor. Jogador desconectado (janela de 15 s) continua alvo e pode morrer (o tick com dt 0 registra a morte). Morte por jogador: mochila (já existia), `COMBAT_EVENT kill` com crédito, `persist`. `PLAYER_STATE.weapon` informa a arma usada.
- Protocolo 5: `COMBAT_EVENT {kind: hit|miss|kill, attacker, victim?, mobId?, x, y, damage?}` (só feedback; nunca é "confirmação" de dano).
- Cliente: números de dano, anel de golpe, flash vermelho ao ser atingido, vibração ao acertar, "Arma: ..." no HUD, ATACAR escurece na recarga (só visual), ícone do porrete.
- Mudança de comportamento da Etapa 8: errar (sem alvo) agora gasta a recarga; golpes contra criatura também exigem linha de visão.
- Testes: `combat.test.ts` (27): armas, salvar/carregar porrete (e save com 2 porretes é recusado), linha de visão, escolha de alvo, proteção, crédito, golpe completo (alcance, rajada de 50 = 1 dano, replay de id, morto/protegido/si mesmo, matar, desconectado, criatura, drop de porrete, 3.000 golpes hostis), formato do golpe forjado. `mobs.test.ts`: contagem de drops do zumbi agora vem da tabela (acrescentou o porrete).
- `attacker.ts`: golpe com alvo/dano/arma/alcance/posição forjados, `actionId` inválido e rajada de 15 golpes (precisa cair em `em_recarga`).
- `server/src/duel.ts` (NOVO, `pnpm --filter @worldzero/server duel`): 2 clientes reais contra um servidor NOVO (porta 2569, ~40 s). Confere: soco = 10 de dano; evento hit para os dois; rajada de 10 = 1 acerto; replay de `actionId`; golpe forjado; golpe fora do alcance (B se afasta) = `miss`; desconectar no meio da luta não evita o dano; matar com golpes válidos; crédito; itens perdidos; mochila no chão; morto não apanha nem ataca; reaparecer com proteção de 3 s; depois o PvP volta.
- Workflow: novo passo "Teste de combate PvP" (porta 2569; servidor separado para não haver jogadores-fantasma do passo do atacante).

## Verificado e não verificado (Etapa 9)
- Verificado (Node 22 + shim do vitest + `tsc`): 117 testes de `shared` passam (27 novos); typecheck de `shared` sem erros; typecheck de `server` (inclui `duel.ts`, `attacker.ts`, `WorldRoom.ts`) e do cliente contra stubs de colyseus/colyseus.js/phaser (só confere o uso dos tipos do `shared`; as chamadas do Phaser em `GameScene.ts` NÃO foram checadas contra o Phaser de verdade).
- Verificado (simulação): o `WorldRoom.ts` REAL rodando em Node contra um `colyseus` de mentira (script temporário, não está no repositório) com 3 clientes falsos e relógio controlado: 20 checagens OK (soco, estado enviado, evento, rajada, replay, golpe forjado, porrete, jogador desconectado morrendo, crédito, 1 mochila, morto não apanha, reaparecer com proteção, PvP volta, dois golpes no mesmo tick = 1 morte e 1 mochila, porrete mata zumbi).
- NÃO verificado: `pnpm install`/typecheck/`pnpm test` reais (vitest de verdade); servidor Colyseus real; `duel.ts` rodando (depende de `room.connection.close()` + `client.reconnect` como no `bot.ts`, de o primeiro `PLAYER_STATE` chegar após reconectar e dos tempos reais de rede); passo do workflow; aparência e toque no celular/A04 (números de dano, flash, botão); desempenho com muitos jogadores batendo ao mesmo tempo.
- Limitações conhecidas / NÃO feito: sem arma de longa distância (o Documento Mestre pede pelo menos uma no MVP; fica para depois do crafting), sem munição, durabilidade, ruído nem animação própria de arma; sem mira/direção (o golpe vai no alvo mais próximo); sem compensação de lag (o cliente vê os outros ~100 ms atrás: golpes na borda do alcance podem errar por pouco); sem escolha manual de arma; porrete só vem de zumbi até o crafting (Etapa 10); sem placar/estatística de mortes; mochila continua expirando em 5 min; proteção de reaparecimento de 3 s é decisão a confirmar (ver DECISOES_TECNICAS).

## Critério de aceite da Etapa 9
O servidor decide o resultado e impede dano fora das regras. Só marcar como concluída quando: (1) o workflow `Verificar` passar, incluindo "Teste de segurança" (atacante atualizado), "Teste de sobrevivência" e "Teste de combate PvP" (todos OK), e (2) o usuário testar em 2 aparelhos num servidor público: um bate no outro (vê o número de dano, a vida cai no outro), o outro morre e deixa a mochila, reaparece com 3 s de proteção.

## Arquivos desta etapa (Etapa 9) - vão no `WORLD-ZERO-etapa9.zip`
Novos: `packages/shared/src/combat.ts`, `packages/shared/src/combat.test.ts`, `apps/server/src/duel.ts`
Alterados: `packages/shared/src/{index,items,life,mobs,mobs.test,protocol}.ts`, `apps/server/src/{attacker.ts,rooms/WorldRoom.ts}`, `apps/server/package.json`, `apps/web/src/{net/NetClient.ts,game/GameScene.ts,ui/SurvivalUi.ts}`, `PROGRESSO.md`, `CHANGELOG.md`, `README.md`, `docs/DECISOES_TECNICAS.md`
Fora do zip (editar à mão): `.github/workflows/verificar.yml` (novo passo "Teste de combate PvP").
Apagados: nenhum.
