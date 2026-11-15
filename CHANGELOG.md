# Changelog

## [Não lançado]
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
