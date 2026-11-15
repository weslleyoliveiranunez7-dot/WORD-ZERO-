# Changelog

## Etapa 12 - Banco e persistência
- PostgreSQL (`DATABASE_URL`) com migrações versionadas e checksum (`players`, `snapshots`, `audit_logs`, `schema_migrations`); aplicadas sozinhas ao ligar o servidor, com lock contra dois servidores migrando juntos.
- Salvamento: autosave de 30 s + gravação em até ~2 s após mudança de inventário + morte, saída e desligamento; uma gravação por vez por personagem.
- Desligamento limpo (SIGTERM/SIGINT): fecha as salas, grava tudo e fecha o banco.
- Snapshots (morte, saída, desligamento, a cada 10 min; 20 por registro) e recuperação automática de personagem ou estruturas inválidos a partir do snapshot válido mais novo.
- Auditoria de eventos críticos (`entrou`, `saiu`, `morte`, recuperações). Backup/restauração manual (`pnpm --filter @worldzero/server backup`).
- Testes: `persistcheck.ts` (armazenamento, snapshots, recuperação, backup, migrações) e `restart.ts` (servidor real: queda brusca, desligamento normal, registro quebrado); workflow com serviço `postgres:16`.
- Ainda não rodado: PostgreSQL real, servidor Colyseus real e `restart.ts` (ver PROGRESSO.md).

## Dia e noite, tocha e visual (2026-11-15)
- Protocolo v8: `REQUEST_TORCH` + `PlayerSnap.torch`: a tocha acesa aparece para todos os jogadores (decidida pelo servidor).
- `shared/daynight.ts`: horario do jogo como funcao do relogio (1 dia = 24 min reais); escuridao maxima as 03:00; transicao suave (smoothstep). 5 testes novos.
- Item `torch` (Tocha) e receita `torch` (2 madeira, sem bancada).
- Cliente: camada de escuridao com luz da tocha (RenderTexture), tocha na mao, botao/tecla T, relogio na tela.
- Sprites novos (personagem, criaturas, arvore/toco, pedra/cascalho, pecas de construcao), modo deitado.

## Etapa 11 (complemento) - Janela, telhado, reparo e acesso compartilhado
- Janela: bloqueia a passagem, não a linha de visão (`ChunkedWorld.extraOpaque`). Telhado: camada de cima, só com fundação sua e apoio (parede/porta/janela sua no tile ou ao lado, ou outro telhado seu ao lado); não bloqueia nada e cai antes da fundação. O cliente deixa quase transparente o telhado em que o jogador está.
- Reparo (só o dono, `REQUEST_BUILD {op:"repair"}`): vida cheia de todas as peças do tile; custa 1 madeira por 25 de vida que faltava (transação).
- Acesso compartilhado (`{op:"trust"}`): o dono dá ou tira o acesso às suas portas e baús do jogador conectado MAIS PRÓXIMO (até 96 px; o servidor escolhe, o cliente nunca manda id). Máximo de 8 pessoas por dono. Quem tem acesso só abre porta e usa baú: não constrói, não repara. Salvo junto com as bases.
- Testes: 6 novos em `building.test.ts` (23 de construção, 165 no total); casos novos em `attacker.ts`.

## Etapa 11 - Construção de base
- Peças: fundação, parede, porta e baú (`shared/building.ts`, custos provisórios em `PIECES`). Um tile tem 1 fundação + 1 peça em cima; parede/porta/baú exigem fundação do próprio jogador.
- Colisão: parede, baú e porta fechada bloqueiam (`ChunkedWorld.extraSolid`: vale para jogadores, criaturas e linha de visão); fundação e porta aberta não. Nada prende jogador: não se constrói nem se fecha porta em cima de alguém.
- Dano estrutural: golpe que não acha jogador nem criatura acerta a estrutura mais próxima no alcance da arma (dano da arma x 0,5). Peça de cima cai primeiro, depois a fundação; baú destruído larga o conteúdo como mochila no chão.
- Só o dono abre/fecha porta e usa o baú; quem não é dono precisa destruir (invasão).
- Persistência: estruturas (e conteúdo dos baús) salvas em um registro único (`world-structures`) no mesmo armazenamento dos personagens, no máximo a cada 5 s e ao encerrar a sala. Se a leitura falhar ou o dado for inválido/de outra seed, a construção fica DESLIGADA (não grava por cima) e tenta de novo a cada 10 s.
- Protocolo 7: `REQUEST_BUILD` (place / toggle / deposit / withdraw), `STRUCTURE_UPDATE`, `CHEST_UPDATE`. Cliente: botão CONSTRUIR, botão PORTA/BAÚ perto de peça sua, painel do baú.
- Testes: 17 novos em `building.test.ts` (159 no total em `shared`); casos novos em `attacker.ts`. Sem passo novo no workflow.
- Ainda não rodado: servidor real (salvar/reiniciar/recarregar), atacante com os casos novos e cliente no celular.

## Etapa 10 - Crafting
- 6 receitas (porrete, bandagem, bancada simples, machado improvisado, picareta simples, lança) em `shared/crafting.ts`. Fabricar é uma transação atômica no servidor: ou consome tudo e entrega o resultado, ou não muda nada. Repetir a mensagem não fabrica de novo (`actionId`), e o tempo da receita deixa o jogador ocupado.
- Itens novos: bancada, machado, picareta, lança (arma de 28 de dano, alcance 72). Machado/picareta no inventário fazem a coleta render 2 unidades (nunca mais do que resta no recurso).
- Protocolo 6: `REQUEST_CRAFT {recipe, actionId}` validado de forma estrita (campo extra ou receita inventada = manipulação).
- Cliente: botão FABRICAR com a lista de receitas (verde = dá para fazer).
- Testes: 25 novos em `crafting.test.ts` (142 no total em `shared`); casos novos em `attacker.ts`. Sem passo novo no workflow.
- Ainda não rodado: servidor real, atacante com os casos novos e cliente no celular (ver PROGRESSO.md).

## Etapa 9 - Combate e PvP
- Golpe de jogador contra jogador e contra criatura decidido 100% no servidor (`performAttack` em `shared/combat.ts`): atacante vivo, `actionId` novo, recarga DA ARMA, alvo mais próximo com alcance e linha de visão, vítima viva e sem proteção, dano.
- Arma simples: porrete (`club`, 20 de dano, alcance 52, recarga 800 ms), largado por zumbis (8%). O servidor usa a arma de maior dano do inventário; sem arma, punho (10 / 48 / 700 ms). O cliente não escolhe arma, alvo nem dano.
- Errar também gasta a recarga. Parede e árvore bloqueiam golpe (água não).
- Jogador desconectado (janela de reconexão de 15 s) continua no mundo e pode ser ferido e morrer (sair no meio da luta não salva).
- Proteção curta de 3 s contra outros jogadores só logo após reaparecer; acaba na hora se o protegido atacar.
- Morte por jogador: mochila no local (já existia), crédito da morte (`killCredit`, janela de 15 s) e evento `kill`.
- Protocolo 5: `COMBAT_EVENT` (só feedback visual: acerto, erro, morte) e `PLAYER_STATE.weapon`.
- Cliente: números de dano flutuantes, anel de golpe, flash vermelho ao ser atingido, vibração ao acertar, linha "Arma: ..." no HUD, botão ATACAR escurece durante a recarga (só visual).
- Testes: 27 novos em `combat.test.ts` (117 no total em `shared`); novos ataques forjados em `attacker.ts`; novo `duel.ts` (2 clientes reais, servidor novo) e passo "Teste de combate PvP" no workflow.
- Ainda não rodado: servidor real, `duel.ts` e cliente no celular (ver PROGRESSO.md).

## Etapa 8 - Zumbis e animais
- Zumbis (perseguem/atacam) e cervos (fogem), simulação por proximidade, ataque corpo a corpo básico, loot, protocolo 4.

## Etapa 7 - Coleta e loot
- Madeira, pedra e sucata coletáveis; mochila de morte; `REQUEST_INTERACT`; `ENTITY_UPDATE`; protocolo 3; botão COLETAR.
- Persistência de personagem: chave no aparelho, salvamento em Supabase ou arquivos, bloqueio de sessão duplicada.

## [Não lançado]
### Etapa 6 - Personagem e sobrevivência (2026-11-14)
- Shared: itens (4), inventário de 12 slots, `SurvivalSim` (vida, fome, sede, energia, tolerância, penalidade de velocidade), `PlayerLife` (usar item com cooldown e `actionId` idempotente, morte que zera o inventário, reaparecimento); validação estrita `inspectUseItem`/`inspectRespawn`; protocolo 2 (`PLAYER_STATE`, `INVENTORY_UPDATE`, `REQUEST_USE_ITEM`, `REQUEST_RESPAWN`, `PlayerSnap.dead`); 31 testes novos (69 no total).
- Servidor: estado de sobrevivência e inventário por jogador, morto não anda, tempo congelado durante a reconexão, `SURVIVAL_SCALE` para testes.
- Cliente: barras, inventário tocável (teclas 1-9), tela de morte com botão REAPARECER (só no modo online).
- Testes de rede: `survivor.ts` (novo) e ataques novos em `attacker.ts`; passo novo no workflow.
- Ainda não rodado: servidor, atacante, survivor e cliente (ver PROGRESSO.md).

### Etapa 5 - Autoridade e segurança (2026-11-15)
- Shared: `PlayerGuard` (limite de frequência e expulsão), `inspectInput` (validação estrita), `PlayerSim` (simulação autoritativa com checagem de velocidade e colisão); 11 testes.
- Servidor: todas as mensagens passam por limite -> validação -> simulação; recusa tipos desconhecidos e ações não implementadas; `ACTION_REJECTED`; log `[seguranca]`; expulsão; `maxPayload` 2 KB.
- Cliente: envio limitado a ~30 msg/s; não reconecta após expulsão.
- Atacante de teste (`attacker.ts`) e passo de segurança no workflow.
- Ainda não rodado: servidor/atacante/cliente (ver PROGRESSO.md).

### Etapa 4 - Servidor multiplayer (2026-11-15)
- Servidor simula o movimento (mesma função do cliente) a 20 Hz e envia `WORLD_SNAPSHOT`; recebe só `PLAYER_INPUT` validado; limite `MAX_PLAYERS`; reconexão por 15 s; recusa protocolo incompatível.
- Cliente: botão JOGAR ONLINE, jogadores remotos interpolados, reconexão automática, `?server=` para apontar o servidor.
- Bot de teste (`apps/server/src/bot.ts`) e passo do workflow com 2 clientes em processos separados.
- Ainda não rodado: servidor, bots e cliente (ver PROGRESSO.md).

### Etapa 3 - Mapa em chunks (2026-11-14)
- Shared: `ChunkedWorld` (chunks de 16x16, mundo de teste 8x8, geração determinística por seed, 4 regiões), carregamento raio 1 e descarregamento raio 2; colisão funciona com mapa fixo e com chunks.
- Cliente: `GameScene` desenha um Graphics por chunk e o destrói ao descarregar; HUD com chunk atual; novo minimapa (`Minimap.ts`).
- 8 testes novos (22 no total em `shared`, rodados em Node). Cliente aguardando workflow e teste no celular.

### Etapa 2 - Primeiro mapa 2D (2026-11-14)
- Shared: mapa de teste 40x30, colisão por caixa com deslize, conversão de entrada em velocidade, 12 testes.
- Cliente: `GameScene` (câmera segue, zoom adaptado à tela), teclado WASD/setas, joystick virtual flutuante, HUD de FPS.
- `BootScene` ganhou o botão JOGAR; servidor passa a ser opcional para o teste.
- Workflow aceita `WORLD-ZERO-*.zip` e publica o cliente no GitHub Pages.
- Verificado só a lógica de `shared`; cliente aguardando o workflow e teste no celular.

### Etapa 1 - Fundação (2026-11-14)
- Monorepo pnpm: `apps/web`, `apps/server`, `packages/shared`.
- Cliente: Vite + TypeScript + Phaser 3 com tela de teste que consulta `/health`.
- Servidor: Node + Colyseus (sala `world`, limite 50) e endpoint `/health`.
- Shared: constantes e nomes de mensagens do protocolo.
- GitHub Actions (`verificar.yml`): typecheck, testes, build web e teste do servidor (/health).
- NÃO verificado: instalação e execução (ver PROGRESSO.md).
