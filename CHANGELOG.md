# Changelog

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
