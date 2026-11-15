# PROGRESSO - WORLD ZERO (arquivo de continuidade)

> Se quem estava implementando (Claude) ficar sem tokens, outra IA pode continuar lendo ESTE arquivo + `docs/DOCUMENTO_MESTRE.txt`.
> Atualize este arquivo ao final de CADA etapa.

Última atualização: 2026-11-14
Etapa atual: **Etapa 4 (Servidor multiplayer) - código escrito; lógica de `shared` testada em Node; servidor, bots e cliente AINDA NÃO rodados**
(Etapa 3: usuário relatou 10-20 FPS no celular; correção por textura enviada, resultado não informado.)

## Regras que valem sempre (resumo do Documento Mestre)
- Executar UMA etapa por vez; só avançar após teste e aprovação do usuário.
- Servidor é autoritativo; cliente só envia intenções.
- Não afirmar que algo funciona sem rodar e registrar o teste real.
- Sem segredos no código/APK/commits. Sem apagar arquitetura funcional sem aprovação.
- GitHub Pages hospeda só o cliente web, nunca o servidor multiplayer.
- Entregar projeto em pastas `parte-1`, `parte-2`... com menos de 100 arquivos cada (limite do upload do GitHub).
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
| 4 | Servidor multiplayer (2 jogadores) | Escrita; falta o workflow provar 2 clientes e teste real em 2 aparelhos |
| 5 | Autoridade e segurança | Pendente |
| 6 | Personagem e sobrevivência | Pendente |
| 7 | Coleta e loot | Pendente |
| 8 | Zumbis e animais | Pendente |
| 9 | Combate e PvP | Pendente |
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
3. Etapa 4 entregue em `WORLD-ZERO-etapa4.zip` (só os arquivos alterados, inclui `verificar.yml` novo que o usuário cola à mão). Depois de aprovada: Etapa 5 (autoridade e segurança).

## Decisões em aberto
Ver `docs/DECISOES_TECNICAS.md`.

## Prompt para continuar em outra IA
"Leia `PROGRESSO.md` e `docs/DOCUMENTO_MESTRE.txt` inteiros. Inspecione o repositório antes de alterar qualquer coisa. Continue a partir da etapa indicada em PROGRESSO.md, execute somente essa etapa, teste de verdade, e atualize PROGRESSO.md e CHANGELOG.md ao final."
